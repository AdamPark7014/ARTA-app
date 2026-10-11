import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var session: Session

    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var challengeId: String?
    @State private var needsEnrollment = false
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?

    private enum Field { case email, password, code }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Spacer(minLength: 72)
                // Sin sesión la app es ARTA neutro (claro): el logotipo real en tinta.
                VStack(spacing: 14) {
                    Image("ArtaLogo")
                        .resizable()
                        .renderingMode(.template)
                        .scaledToFit()
                        .frame(height: 74)
                        .foregroundStyle(ArtaColor.text)
                        .accessibilityLabel("Arta Producciones")
                    CapLabel("Operación")
                }
                .padding(.bottom, 20)

                if needsEnrollment {
                    enrollment
                } else if challengeId != nil {
                    codeStep
                } else {
                    credentials
                }

                if let error {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(ArtaColor.danger)
                        .multilineTextAlignment(.center)
                }

                legalLinks
            }
            .padding(24)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .artaScreenBackground()
    }

    private var credentials: some View {
        VStack(spacing: 14) {
            field {
                TextField("Correo", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focus, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focus = .password }
                    // Identificadores estables para la prueba de interfaz que
                    // sacará las capturas de la ficha (no dependen del texto).
                    .accessibilityIdentifier("login-email")
            }
            field {
                SecureField("Contraseña", text: $password)
                    .textContentType(.password)
                    .focused($focus, equals: .password)
                    .submitLabel(.go)
                    .onSubmit(submit)
                    .accessibilityIdentifier("login-password")
            }
            primaryButton(busy ? "Entrando…" : "Entrar", disabled: email.isEmpty || password.isEmpty, action: submit)
                .accessibilityIdentifier("login-submit")
        }
    }

    private var codeStep: some View {
        VStack(spacing: 14) {
            Text("Escribe el código de 6 dígitos de tu app de autenticación.")
                .font(.subheadline)
                .foregroundStyle(ArtaColor.muted)
                .multilineTextAlignment(.center)
            field {
                TextField("000000", text: $code)
                    .textContentType(.oneTimeCode)
                    .keyboardType(.numberPad)
                    .font(.title2.monospacedDigit())
                    .multilineTextAlignment(.center)
                    .focused($focus, equals: .code)
                    .onChange(of: code) { _, value in
                        let digits = String(value.filter(\.isNumber).prefix(6))
                        if digits != value { code = digits }
                        if digits.count == 6 { verify() }
                    }
                    .accessibilityIdentifier("login-code")
            }
            primaryButton(busy ? "Verificando…" : "Verificar", disabled: code.count < 6, action: verify)
                .accessibilityIdentifier("login-verify")
            Button("Usar otra cuenta") {
                challengeId = nil
                code = ""
                error = nil
            }
            .foregroundStyle(ArtaColor.muted)
        }
        .onAppear { focus = .code }
    }

    private var enrollment: some View {
        VStack(spacing: 14) {
            Image(systemName: "lock.shield").font(.system(size: 36, weight: .light)).foregroundStyle(ArtaColor.text)
            Text("Tu organización exige verificación en dos pasos. Actívala primero en el panel web y luego vuelve a entrar aquí.")
                .multilineTextAlignment(.center)
                .foregroundStyle(ArtaColor.text)
            Link("Abrir el panel web", destination: ApiConfig.origin)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(ArtaColor.text)
            Button("Volver") {
                needsEnrollment = false
                error = nil
            }
            .foregroundStyle(ArtaColor.muted)
        }
    }

    /// Aviso de privacidad y términos alcanzables antes de entrar (Apple 5.1.1(i)):
    /// al pie y en gris, para no competir con el formulario.
    private var legalLinks: some View {
        HStack(spacing: 16) {
            Link("Aviso de privacidad", destination: ArtaAppMeta.privacidadURL)
                .accessibilityIdentifier("login-privacy")
            Link("Términos", destination: ArtaAppMeta.terminosURL)
                .accessibilityIdentifier("login-terms")
        }
        .font(.caption)
        .foregroundStyle(ArtaColor.tertiary)
        .padding(.top, 24)
    }

    /// Campo: superficie con borde de línea fuerte (sistema visual, «Formularios»).
    private func field<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: ArtaRadius.inner, style: .continuous)
        return content()
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(shape.fill(ArtaColor.surface))
            .overlay(shape.strokeBorder(ArtaColor.lineStrong, lineWidth: 1))
            .foregroundStyle(ArtaColor.text)
    }

    private func primaryButton(_ title: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .buttonStyle(ArtaPrimaryButtonStyle())
            .disabled(disabled || busy)
    }

    private func submit() {
        guard !busy, !email.isEmpty, !password.isEmpty else { return }
        busy = true
        error = nil
        Task {
            apply(await session.login(email: email, password: password))
        }
    }

    private func verify() {
        guard !busy, let challengeId, code.count == 6 else { return }
        busy = true
        error = nil
        Task {
            apply(await session.verifyCode(challengeId: challengeId, code: code))
        }
    }

    private func apply(_ result: Session.LoginResult) {
        busy = false
        switch result {
        case .success:
            password = ""
        case .needsCode(let id):
            challengeId = id
        case .needsEnrollment:
            needsEnrollment = true
        case .error(let message):
            error = message
            code = ""
        }
    }
}
