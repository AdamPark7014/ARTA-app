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
                Spacer(minLength: 60)
                VStack(spacing: 8) {
                    Text("ARTA")
                        .font(.system(size: 44, weight: .heavy, design: .serif))
                        .tracking(8)
                        .foregroundStyle(ArtaColor.gold)
                    Text("Producciones · Operación")
                        .font(.subheadline)
                        .foregroundStyle(ArtaColor.muted)
                }
                .padding(.bottom, 16)

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
            }
            .padding(24)
            .frame(maxWidth: 440)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(ArtaColor.bg.ignoresSafeArea())
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
            }
            field {
                SecureField("Contraseña", text: $password)
                    .textContentType(.password)
                    .focused($focus, equals: .password)
                    .submitLabel(.go)
                    .onSubmit(submit)
            }
            primaryButton(busy ? "Entrando…" : "Entrar", disabled: email.isEmpty || password.isEmpty, action: submit)
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
            }
            primaryButton(busy ? "Verificando…" : "Verificar", disabled: code.count < 6, action: verify)
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
            Image(systemName: "lock.shield").font(.system(size: 40)).foregroundStyle(ArtaColor.gold)
            Text("Tu organización exige verificación en dos pasos. Actívala primero en el panel web y luego vuelve a entrar aquí.")
                .multilineTextAlignment(.center)
                .foregroundStyle(ArtaColor.text)
            Link("Abrir el panel web", destination: ApiConfig.origin)
                .foregroundStyle(ArtaColor.gold)
            Button("Volver") {
                needsEnrollment = false
                error = nil
            }
            .foregroundStyle(ArtaColor.muted)
        }
    }

    private func field<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 12).fill(ArtaColor.bgElev))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(ArtaColor.line))
            .foregroundStyle(ArtaColor.text)
    }

    private func primaryButton(_ title: String, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(RoundedRectangle(cornerRadius: 12).fill(ArtaColor.gold))
                .foregroundStyle(ArtaColor.bg)
        }
        .disabled(disabled || busy)
        .opacity(disabled || busy ? 0.6 : 1)
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
