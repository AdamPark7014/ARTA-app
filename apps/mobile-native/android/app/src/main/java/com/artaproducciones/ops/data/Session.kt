package com.artaproducciones.ops.data

import android.content.Context
import com.artaproducciones.ops.data.api.ApiClient
import com.artaproducciones.ops.data.api.ApiDebugHooks
import com.artaproducciones.ops.data.api.LoginBody
import com.artaproducciones.ops.data.api.LoginResponse
import com.artaproducciones.ops.data.api.UserDto
import com.artaproducciones.ops.data.api.VerifyLoginBody
import com.artaproducciones.ops.data.api.WebSessionBridge
import com.artaproducciones.ops.data.api.userMessage
import com.artaproducciones.ops.data.realtime.RealtimeClient
import com.artaproducciones.ops.push.ArtaPushRenderer
import com.artaproducciones.ops.push.PushRegistration
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import retrofit2.HttpException

/** Sesión de la app: quién entró y el ciclo login → push/socket → logout. */
object Session {
    sealed interface State {
        data object Loading : State
        data object SignedOut : State
        data class SignedIn(val user: UserDto) : State
    }

    sealed interface LoginResult {
        data object Success : LoginResult
        data class NeedsCode(val challengeId: String) : LoginResult
        /** La organización exige 2FA y la persona no lo ha configurado: se hace en la web. */
        data object NeedsEnrollment : LoginResult
        data class Error(val message: String) : LoginResult
    }

    private const val PREFS = "arta_session"
    private const val KEY_USER = "user"

    private lateinit var app: Context
    private val _state = MutableStateFlow<State>(State.Loading)
    val state: StateFlow<State> = _state

    val currentUser: UserDto? get() = (state.value as? State.SignedIn)?.user

    fun init(context: Context) {
        app = context.applicationContext
    }

    /** Al abrir la app: con cookie guardada se confirma con `/auth/me`; sin red se usa el último usuario. */
    suspend fun restore() {
        // Solo debug: el modo demo entra directo con el usuario de las fixtures (sin cookie ni login).
        if (ApiDebugHooks.demo) {
            runCatching { ApiClient.api.me().user }
                .onSuccess { signedIn(it) }
                .onFailure { _state.value = State.SignedOut }
            return
        }
        if (!ApiClient.hasSession()) {
            _state.value = State.SignedOut
            return
        }
        try {
            val user = ApiClient.api.me().user
            signedIn(user)
        } catch (e: HttpException) {
            if (e.code() == 401) expire() else cachedUser()?.let { signedIn(it) } ?: run { _state.value = State.SignedOut }
        } catch (e: Exception) {
            cachedUser()?.let { signedIn(it) } ?: run { _state.value = State.SignedOut }
        }
    }

    suspend fun login(email: String, password: String): LoginResult =
        handle { ApiClient.api.login(LoginBody(email.trim(), password)) }

    suspend fun verifyCode(challengeId: String, code: String): LoginResult =
        handle { ApiClient.api.verifyLogin(VerifyLoginBody(challengeId, code.filter { it.isDigit() })) }

    private suspend fun handle(call: suspend () -> LoginResponse): LoginResult = try {
        val res = call()
        when {
            res.requires2fa == true && !res.challengeId.isNullOrBlank() -> LoginResult.NeedsCode(res.challengeId)
            res.requiresTotpEnrollment == true -> LoginResult.NeedsEnrollment
            else -> {
                // La respuesta del login trae un usuario parcial: el completo sale de /auth/me.
                val user = runCatching { ApiClient.api.me().user }.getOrNull() ?: res.user
                if (user == null) LoginResult.Error("No se pudo abrir la sesión") else {
                    signedIn(user)
                    LoginResult.Success
                }
            }
        }
    } catch (e: Exception) {
        LoginResult.Error(e.userMessage())
    }

    private fun signedIn(user: UserDto) {
        // Modo demo: la sesión ficticia vive solo en memoria; no pisa la guardada ni abre socket/push.
        if (ApiDebugHooks.demo) {
            _state.value = State.SignedIn(user)
            return
        }
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(
                KEY_USER,
                JSONObject()
                    .put("id", user.id)
                    .put("fullName", user.fullName)
                    .put("email", user.email)
                    .put("roleKey", user.roleKey)
                    .put("entities", JSONArray(user.entities))
                    .put("permissions", JSONArray(user.permissions))
                    .toString(),
            )
            .apply()
        _state.value = State.SignedIn(user)
        RealtimeClient.connect()
        PushRegistration.registerAsync(app)
    }

    suspend fun logout() {
        // Primero la baja del token: después ya no hay cookie para autorizarla.
        withTimeoutOrNull(5_000) { PushRegistration.unregister(app) }
        withTimeoutOrNull(5_000) { runCatching { ApiClient.api.logout() } }
        clearLocal()
    }

    /** 401 del API: la sesión se venció o se revocó en «Sesiones» de la web. */
    fun expire() {
        if (_state.value is State.SignedOut) return
        clearLocal()
    }

    private fun clearLocal() {
        // Modo demo: «Cerrar sesión» no borra la sesión real que hubiera guardada en el teléfono.
        if (ApiDebugHooks.demo) {
            _state.value = State.SignedOut
            return
        }
        RealtimeClient.disconnect()
        ApiClient.cookies.clear()
        WebSessionBridge.clear()
        ArtaPushRenderer.clearAll(app)
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
        _state.value = State.SignedOut
    }

    private fun cachedUser(): UserDto? {
        val raw = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_USER, null) ?: return null
        return runCatching {
            val o = JSONObject(raw)
            fun list(key: String) = o.optJSONArray(key)?.let { a -> (0 until a.length()).map { a.optString(it) } }.orEmpty()
            UserDto(
                id = o.getString("id"),
                fullName = o.optString("fullName"),
                email = o.optString("email"),
                roleKey = o.optString("roleKey"),
                entities = list("entities"),
                permissions = list("permissions"),
            )
        }.getOrNull()
    }
}
