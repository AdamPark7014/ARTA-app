import SwiftUI

/// Entrada: sin sesión la app es ARTA (papel y tinta). Marca con «La experiencia del Show»,
/// una tarjeta con los campos rotulados y la acción principal en el acento; abajo, el aviso de
/// privacidad y los términos. Todo centrado en la pantalla y desplazable cuando sube el teclado.
struct LoginView: View {
    @EnvironmentObject private var session: Session

    @State private var email = ""
    @State private var password = ""
    @State private var showPassword = false
    @State private var code = ""
    @State private var challengeId: String?
    @State private var needsEnrollment = false
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?

    private enum Field { case email, password, code }

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 0) {
                    Spacer(minLength: ArtaSpace.xxxl)
                    brand
                        .padding(.bottom, ArtaSpace.xxxl)

                    VStack(alignment: .leading, spacing: ArtaSpace.l) {
                        if needsEnrollment {
                            enrollment
                        } else if challengeId != nil {
                            codeStep
                        } else {
                            credentials
                        }
                        if let error {
                            Label(error, systemImage: "exclamationmark.circle")
                                .font(.footnote)
                                .foregroundStyle(ArtaColor.danger)
                                .fixedSize(horizontal: false, vertical: true)
                                .transition(.opacity)
                                .accessibilityIdentifier("login-error")
                        }
                    }
                    .animation(.easeOut(duration: 0.18), value: error)
                    .animation(.easeInOut(duration: 0.22), value: challengeId)
                    .animation(.easeInOut(duration: 0.22), value: needsEnrollment)
                    .padding(ArtaSpace.xl)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(ArtaCardBackground(radius: ArtaRadius.card + 4))

                    demoEntry
                        .padding(.top, ArtaSpace.l)

                    Spacer(minLength: ArtaSpace.xxxl)
                    legalLinks
                        .padding(.bottom, ArtaSpace.s)
                }
                .padding(.horizontal, ArtaSpace.xxl)
                .frame(maxWidth: 440)
                .frame(maxWidth: .infinity)
                // Centrado en la pantalla; con el teclado arriba el alto se encoge y se desplaza.
                .frame(minHeight: geo.size.height)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
        }
        .artaScreenBackground()
    }

    // MARK: Marca

    private var brand: some View {
        VStack(spacing: ArtaSpace.l) {
            Image("ArtaLogo")
                .resizable()
                .renderingMode(.template)
                .scaledToFit()
                .frame(height: 70)
                .foregroundStyle(ArtaColor.text)
                .accessibilityLabel("ARTA")
            Text("La experiencia del Show")
                .font(ArtaFont.display(20, weight: .light))
                .tracking(-0.3)
                .foregroundStyle(ArtaColor.muted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    // MARK: Pasos

    private var credentials: some View {
        VStack(alignment: .leading, spacing: ArtaSpace.l) {
            heading("Inicia sesión", detail: "Con la misma cuenta del panel web.")
            labeled("Correo") {
                field(focused: focus == .email) {
                    TextField("", text: $email, prompt: prompt("nombre@empresa.com"))
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focus, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focus = .password }
                        // Identificadores estables para las pruebas de interfaz (no dependen del texto).
                        .accessibilityLabel("Correo")
                        .accessibilityIdentifier("login-email")
                }
            }
            labeled("Contraseña") {
                field(focused: focus == .password) {
                    HStack(spacing: ArtaSpace.s) {
                        Group {
                            if showPassword {
                                TextField("", text: $password, prompt: prompt("Tu contraseña"))
                                    .textInputAutocapitalization(.never)
                                    .autocorrectionDisabled()
                            } else {
                                SecureField("", text: $password, prompt: prompt("Tu contraseña"))
                            }
                        }
                        .textContentType(.password)
                        .focused($focus, equals: .password)
                        .submitLabel(.go)
                        .onSubmit(submit)
                        .accessibilityLabel("Contraseña")
                        .accessibilityIdentifier("login-password")
                        Button {
                            showPassword.toggle()
                            focus = .password
                        } label: {
                            Image(systemName: showPassword ? "eye.slash" : "eye")
                                .font(.system(size: 15, weight: .regular))
                                .foregroundStyle(ArtaColor.tertiary)
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        // El ojo se queda a la orilla del campo: el resto del cuadro es solo para el dedo.
                        .padding(.trailing, -ArtaSpace.s)
                        .accessibilityLabel(showPassword ? "Ocultar contraseña" : "Mostrar contraseña")
                    }
                }
            }
            primaryButton(busy ? "Entrando…" : "Entrar", disabled: email.isEmpty || password.isEmpty, action: submit)
                .padding(.top, ArtaSpace.xs)
                .accessibilityIdentifier("login-submit")
        }
    }

    private var codeStep: some View {
        VStack(alignment: .leading, spacing: ArtaSpace.l) {
            heading("Verificación en dos pasos", detail: "Escribe el código de 6 dígitos de tu app de autenticación.")
            field(focused: focus == .code) {
                TextField("", text: $code, prompt: prompt("000000"))
                    .textContentType(.oneTimeCode)
                    .keyboardType(.numberPad)
                    .font(.title2.monospacedDigit())
                    .tracking(4)
                    .multilineTextAlignment(.center)
                    .focused($focus, equals: .code)
                    .onChange(of: code) { _, value in
                        let digits = String(value.filter(\.isNumber).prefix(6))
                        if digits != value { code = digits }
                        if digits.count == 6 { verify() }
                    }
                    .accessibilityLabel("Código")
                    .accessibilityIdentifier("login-code")
            }
            primaryButton(busy ? "Verificando…" : "Verificar", disabled: code.count < 6, action: verify)
                .accessibilityIdentifier("login-verify")
            quietButton("Usar otra cuenta") {
                challengeId = nil
                code = ""
                error = nil
            }
        }
        .onAppear { focus = .code }
    }

    private var enrollment: some View {
        VStack(alignment: .leading, spacing: ArtaSpace.l) {
            Image(systemName: "lock.shield")
                .font(.system(size: 28, weight: .light))
                .foregroundStyle(ArtaColor.text)
            heading("Activa la verificación en dos pasos",
                    detail: "Tu organización la exige. Actívala primero en el panel web y luego vuelve a entrar aquí.")
            Link(destination: ApiConfig.origin) {
                Label("Abrir el panel web", systemImage: "arrow.up.right")
            }
            .buttonStyle(ArtaPrimaryButtonStyle())
            quietButton("Volver") {
                needsEnrollment = false
                error = nil
            }
        }
    }

    // MARK: Modo demostración

    /// Para quien aún no tiene cuenta (y para App Review): la app entera con datos
    /// ficticios, sin cuenta ni conexión (`Session.enterDemo`). Debajo, cómo contratar.
    private var demoEntry: some View {
        VStack(spacing: ArtaSpace.s) {
            Button {
                Haptics.tap()
                error = nil
                focus = nil
                session.enterDemo()
            } label: {
                // El estilo va en un renglón: se achica antes que cortarse en pantallas chicas.
                Label("Explorar ARTA con datos de muestra", systemImage: "sparkles")
                    .minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(ArtaSecondaryButtonStyle())
            .disabled(busy)
            .accessibilityIdentifier("login-demo")
            Text("Sin cuenta ni conexión. Datos ficticios de una productora de ejemplo.")
                .font(.caption)
                .foregroundStyle(ArtaColor.tertiary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            Link(destination: ArtaAppMeta.contratarURL) {
                Text("¿Tu productora o recinto aún no usa ARTA? Solicítala aquí")
                    .font(.caption.weight(.semibold))
                    .underline(true, color: ArtaColor.lineStrong)
                    .multilineTextAlignment(.center)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .foregroundStyle(ArtaColor.muted)
            .accessibilityIdentifier("login-contratar")
        }
        .frame(maxWidth: .infinity)
    }

    /// Aviso de privacidad y términos alcanzables antes de entrar (Apple 5.1.1(i)): al pie,
    /// discretos pero claramente enlaces (subrayado fino).
    private var legalLinks: some View {
        HStack(spacing: ArtaSpace.m) {
            Link(destination: ArtaAppMeta.privacidadURL) {
                Text("Aviso de privacidad")
                    .underline(true, color: ArtaColor.lineStrong)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityIdentifier("login-privacy")
            Text("·").foregroundStyle(ArtaColor.tertiary).accessibilityHidden(true)
            Link(destination: ArtaAppMeta.terminosURL) {
                Text("Términos")
                    .underline(true, color: ArtaColor.lineStrong)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityIdentifier("login-terms")
        }
        .font(.footnote)
        .foregroundStyle(ArtaColor.muted)
        .frame(maxWidth: .infinity)
    }

    // MARK: Piezas

    private func heading(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: ArtaSpace.xs) {
            Text(title)
                .font(ArtaFont.display(22, weight: .semibold))
                .tracking(-0.3)
                .foregroundStyle(ArtaColor.text)
                .accessibilityAddTraits(.isHeader)
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(ArtaColor.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.bottom, ArtaSpace.xs)
    }

    private func labeled<Content: View>(_ label: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: ArtaSpace.s) {
            CapLabel(label, color: ArtaColor.muted)
                .accessibilityHidden(true)
            content()
        }
    }

    private func prompt(_ text: String) -> Text {
        Text(text).foregroundColor(ArtaColor.tertiary)
    }

    /// Campo: superficie suave con borde de línea fuerte; con el foco, anillo de 2 pt del texto al 15 %.
    private func field<Content: View>(focused: Bool, @ViewBuilder _ content: () -> Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: ArtaRadius.inner, style: .continuous)
        return content()
            .font(.body)
            .foregroundStyle(ArtaColor.text)
            .tint(ArtaColor.text)
            .padding(.horizontal, 14)
            .frame(minHeight: 50)
            .background(shape.fill(ArtaColor.surfaceSoft))
            .overlay(shape.strokeBorder(focused ? ArtaColor.text.opacity(0.45) : ArtaColor.lineStrong, lineWidth: 1))
            .overlay(shape.inset(by: -3).strokeBorder(ArtaColor.text.opacity(focused ? 0.12 : 0), lineWidth: 3))
            .animation(.easeOut(duration: 0.15), value: focused)
    }

    private func primaryButton(_ title: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: ArtaSpace.s) {
                if busy { ProgressView().tint(ArtaColor.tertiary) }
                Text(title)
            }
        }
        .buttonStyle(ArtaPrimaryButtonStyle())
        .disabled(disabled || busy)
    }

    /// Acción de texto discreta («Volver», «Usar otra cuenta»), con 44 pt para el dedo.
    private func quietButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(ArtaColor.muted)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func submit() {
        guard !busy, !email.isEmpty, !password.isEmpty else { return }
        busy = true
        error = nil
        focus = nil
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
            Haptics.success()
            password = ""
        case .needsCode(let id):
            Haptics.tap()
            challengeId = id
        case .needsEnrollment:
            Haptics.warning()
            needsEnrollment = true
        case .error(let message):
            Haptics.error()
            error = message
            code = ""
        }
    }
}
