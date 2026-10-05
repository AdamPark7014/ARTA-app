#!/usr/bin/env python3
"""Prepara la firma de App Store de ARTA con la llave de App Store Connect.

En el runner de TestFlight, sin Mac ni portal a mano:
  1. registra los bundle id de la app y de la extensión si no existen,
  2. activa push (y notificaciones de comunicación si la API lo permite),
  3. busca el certificado de distribución del equipo que llega por secreto,
  4. rehace los perfiles IOS_APP_STORE de cada bundle y los instala,
  5. escribe Config/<target>.signing.xcconfig con firma manual.

Entrada (variables de entorno): ASC_KEY_PATH, ASC_KEY_ID, ASC_ISSUER_ID,
CERT_DER_BASE64 (el .cer de distribución en base64), TEAM_ID, IOS_DIR.
Salida: añade APP_PROFILE_NAME, NSE_PROFILE_NAME, APP_PROFILE_UUID y
NSE_PROFILE_UUID a $GITHUB_ENV. Solo biblioteca estándar y openssl.
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://api.appstoreconnect.apple.com/v1"

TARGETS = [
    # (target de Xcode, bundle id, nombre en el portal, nombre del perfil, capacidades)
    (
        "ArtaApp",
        "com.artaproducciones.ops",
        "ARTA App",
        "ARTA App Store",
        ["PUSH_NOTIFICATIONS", "USERNOTIFICATIONS_COMMUNICATION"],
    ),
    (
        "NotificationService",
        "com.artaproducciones.ops.NotificationService",
        "ARTA NotificationService",
        "ARTA NotificationService App Store",
        [],
    ),
]


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def der_ecdsa_to_raw(der: bytes) -> bytes:
    """Firma ECDSA en DER (openssl) → R||S de 32+32 bytes (JWT ES256)."""
    if len(der) < 8 or der[0] != 0x30:
        raise SystemExit("firma openssl no es un SEQUENCE DER")
    i = 2
    if der[1] & 0x80:
        i = 2 + (der[1] & 0x7F)

    def read_int(buf: bytes, pos: int) -> tuple[bytes, int]:
        if pos >= len(buf) or buf[pos] != 0x02:
            raise SystemExit("firma DER sin INTEGER")
        ln = buf[pos + 1]
        pos += 2
        raw = buf[pos : pos + ln]
        pos += ln
        if len(raw) > 32:
            raw = raw[-32:]
        return raw.rjust(32, b"\x00"), pos

    r, i = read_int(der, i)
    s, i = read_int(der, i)
    return r + s


def make_jwt(key_path: str, key_id: str, issuer_id: str) -> str:
    now = int(time.time())
    header = b64url(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}, separators=(",", ":")).encode())
    payload = b64url(
        json.dumps(
            {"iss": issuer_id, "iat": now, "exp": now + 1100, "aud": "appstoreconnect-v1"},
            separators=(",", ":"),
        ).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    der = subprocess.check_output(["openssl", "dgst", "-sha256", "-sign", key_path], input=signing_input)
    return f"{header}.{payload}.{b64url(der_ecdsa_to_raw(der))}"


class Asc:
    def __init__(self, token: str) -> None:
        self.token = token

    def call(self, method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
        url = API + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", f"Bearer {self.token}")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read().decode()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode(errors="replace")
            raise AscError(exc.code, f"{method} {path} → HTTP {exc.code}: {detail}") from exc
        return json.loads(raw) if raw.strip() else {}


class AscError(Exception):
    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code


def ensure_bundle_id(asc: Asc, identifier: str, name: str) -> str:
    found = asc.call("GET", "/bundleIds", query={"filter[identifier]": identifier, "limit": "50"})
    for item in found.get("data") or []:
        if (item.get("attributes") or {}).get("identifier") == identifier:
            print(f"bundle id {identifier} ya existe ({item['id']})")
            return item["id"]
    created = asc.call(
        "POST",
        "/bundleIds",
        {"data": {"type": "bundleIds", "attributes": {"identifier": identifier, "name": name, "platform": "IOS"}}},
    )
    print(f"bundle id {identifier} registrado ({created['data']['id']})")
    return created["data"]["id"]


def ensure_capabilities(asc: Asc, bundle_pk: str, wanted: list[str]) -> list[str]:
    """Devuelve las capacidades que NO se pudieron activar."""
    if not wanted:
        return []
    # Esta relación no acepta `limit` (HTTP 400 PARAMETER_ERROR.ILLEGAL); trae todas de una vez.
    current = asc.call("GET", f"/bundleIds/{bundle_pk}/bundleIdCapabilities")
    have = {(c.get("attributes") or {}).get("capabilityType") for c in current.get("data") or []}
    failed = []
    for cap in wanted:
        if cap in have:
            print(f"  capacidad {cap}: ya activa")
            continue
        try:
            asc.call(
                "POST",
                "/bundleIdCapabilities",
                {
                    "data": {
                        "type": "bundleIdCapabilities",
                        "attributes": {"capabilityType": cap},
                        "relationships": {"bundleId": {"data": {"type": "bundleIds", "id": bundle_pk}}},
                    }
                },
            )
            print(f"  capacidad {cap}: activada")
        except AscError as exc:
            print(f"  AVISO capacidad {cap} no se pudo activar: {exc}")
            failed.append(cap)
    return failed


def find_certificate(asc: Asc, cert_b64: str) -> str:
    wanted = "".join(cert_b64.split())
    for cert_type in ("DISTRIBUTION", "IOS_DISTRIBUTION"):
        found = asc.call("GET", "/certificates", query={"filter[certificateType]": cert_type, "limit": "200"})
        for item in found.get("data") or []:
            content = "".join(((item.get("attributes") or {}).get("certificateContent") or "").split())
            if content == wanted:
                attrs = item.get("attributes") or {}
                print(f"certificado de distribución: {attrs.get('name')} · vence {attrs.get('expirationDate')} ({item['id']})")
                return item["id"]
    raise SystemExit(
        "El certificado del secreto no aparece entre los de distribución del equipo. "
        "Revisa DISTRIBUTION_CERT_CER_BASE64 (o el .p12) y que sea del equipo correcto."
    )


def remake_profile(asc: Asc, name: str, bundle_pk: str, cert_pk: str) -> tuple[str, bytes]:
    old = asc.call("GET", "/profiles", query={"filter[name]": name, "limit": "50"})
    for item in old.get("data") or []:
        if (item.get("attributes") or {}).get("name") == name:
            asc.call("DELETE", f"/profiles/{item['id']}")
            print(f"  perfil viejo «{name}» borrado ({item['id']})")
    created = asc.call(
        "POST",
        "/profiles",
        {
            "data": {
                "type": "profiles",
                "attributes": {"name": name, "profileType": "IOS_APP_STORE"},
                "relationships": {
                    "bundleId": {"data": {"type": "bundleIds", "id": bundle_pk}},
                    "certificates": {"data": [{"type": "certificates", "id": cert_pk}]},
                },
            }
        },
    )
    attrs = created["data"]["attributes"]
    print(f"  perfil «{name}» creado · UUID {attrs['uuid']}")
    return attrs["uuid"], base64.b64decode(attrs["profileContent"])


def install_profile(uuid: str, content: bytes) -> None:
    home = Path.home()
    for folder in (
        home / "Library/MobileDevice/Provisioning Profiles",
        home / "Library/Developer/Xcode/UserData/Provisioning Profiles",
    ):
        folder.mkdir(parents=True, exist_ok=True)
        (folder / f"{uuid}.mobileprovision").write_bytes(content)


def main() -> None:
    env = {k: os.environ.get(k, "") for k in ("ASC_KEY_PATH", "ASC_KEY_ID", "ASC_ISSUER_ID", "CERT_DER_BASE64", "TEAM_ID", "IOS_DIR")}
    missing = [k for k, v in env.items() if not v]
    if missing:
        raise SystemExit("faltan variables: " + ", ".join(missing))

    asc = Asc(make_jwt(env["ASC_KEY_PATH"], env["ASC_KEY_ID"], env["ASC_ISSUER_ID"]))
    cert_pk = find_certificate(asc, env["CERT_DER_BASE64"])
    config_dir = Path(env["IOS_DIR"]) / "Config"
    outputs: dict[str, str] = {}
    failed_caps: list[str] = []

    for target, identifier, portal_name, profile_name, caps in TARGETS:
        print(f"── {target} ({identifier})")
        bundle_pk = ensure_bundle_id(asc, identifier, portal_name)
        failed_caps += ensure_capabilities(asc, bundle_pk, caps)
        uuid, content = remake_profile(asc, profile_name, bundle_pk, cert_pk)
        install_profile(uuid, content)
        (config_dir / f"{target}.signing.xcconfig").write_text(
            "\n".join(
                [
                    "CODE_SIGN_STYLE = Manual",
                    f"DEVELOPMENT_TEAM = {env['TEAM_ID']}",
                    "CODE_SIGN_IDENTITY = Apple Distribution",
                    "ARTA_CODE_SIGN_IDENTITY = Apple Distribution",
                    f"PROVISIONING_PROFILE_SPECIFIER = {profile_name}",
                    "",
                ]
            ),
            encoding="utf-8",
        )
        prefix = "APP" if target == "ArtaApp" else "NSE"
        outputs[f"{prefix}_PROFILE_NAME"] = profile_name
        outputs[f"{prefix}_PROFILE_UUID"] = uuid

    outputs["FAILED_CAPABILITIES"] = ",".join(failed_caps)
    gh_env = os.environ.get("GITHUB_ENV")
    if gh_env:
        with open(gh_env, "a", encoding="utf-8") as fh:
            for k, v in outputs.items():
                fh.write(f"{k}={v}\n")
    for k, v in outputs.items():
        print(f"{k}={v}")


if __name__ == "__main__":
    try:
        main()
    except AscError as exc:
        print(f"App Store Connect: {exc}", file=sys.stderr)
        sys.exit(1)
