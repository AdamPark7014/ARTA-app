package com.artaproducciones.ops.data

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.snapshotFlow
import com.artaproducciones.ops.data.api.UserDto
import kotlinx.coroutines.flow.Flow

/**
 * Los dos negocios de la organización (docs/entidades-arta-auditorio.md). [key] es el valor
 * del API (`?entity=`, `Event.entity`…); [short] es lo que se ve en el selector y [brand] la marca.
 */
enum class BizEntity(val key: String, val short: String, val brand: String) {
    ARTA("ARTA", "Arta", "Arta Producciones"),
    EXPLANADA("EXPLANADA", "Auditorio", "Auditorio Explanada");

    val other: BizEntity get() = if (this == ARTA) EXPLANADA else ARTA

    companion object {
        fun of(key: String?): BizEntity? = entries.firstOrNull { it.key.equals(key?.trim(), ignoreCase = true) }
    }
}

/**
 * Entidad activa de la app: con ella se piden todos los listados (`?entity=`) y se pinta el
 * acento (dorado Arta, plateado Auditorio). Se guarda por usuario; quien tiene una sola entidad
 * queda fijo en ella.
 *
 * Vive en estado de Compose (snapshot): leer [current] dentro de una pantalla la vuelve a
 * componer al cambiar, y fuera de Compose se lee igual (la llamada HTTP toma el valor del momento).
 */
object ActiveEntity {
    private const val PREFS = "arta_entity"
    private const val KEY_PREFIX = "active:"

    private val TOP_ROLES = setOf("dir_general", "super_admin")

    private var prefs: SharedPreferences? = null
    private var userId: String? = null
    private var persist = false

    private val _current = mutableStateOf(BizEntity.ARTA)
    private val _available = mutableStateOf(listOf(BizEntity.ARTA))
    private var allowed: Set<BizEntity> = emptySet()

    /** Entidad con la que trabaja la app ahora. */
    val current: BizEntity get() = _current.value

    /** Entidades entre las que la persona puede cambiar (una sola si no es híbrida). */
    val available: List<BizEntity> get() = _available.value

    /** Híbrido: dirección general / plataforma, o quien tiene las dos entidades. Solo ellos cambian. */
    val isHybrid: Boolean get() = available.size > 1

    /**
     * Valor de `?entity=` y del campo `entity` al crear. Null si el API no reconoce esa entidad
     * para la persona (sin entidades asignadas): pedirla daría 403, y sin el parámetro el API
     * contesta con todas las suyas.
     */
    val param: String? get() = current.takeIf { it in allowed }?.key

    /** Cada cambio (también el primero al suscribirse). */
    val changes: Flow<BizEntity> get() = snapshotFlow { _current.value }

    fun init(context: Context) {
        prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }

    /**
     * Al entrar (o al restaurar la sesión): calcula entre qué entidades puede moverse [user] y
     * arranca en la última que usó o, si no hay, en la primera de las suyas (ARTA si tiene las dos).
     * [save] = false en el modo demo: no se guarda nada en el teléfono.
     */
    fun bind(user: UserDto, save: Boolean = true) {
        val options = availableFor(user.roleKey, user.entities)
        val saved = if (save) BizEntity.of(prefs?.getString(KEY_PREFIX + user.id, null)) else null
        userId = user.id
        persist = save
        allowed = allowedFor(user.roleKey, user.entities)
        _available.value = options
        _current.value = initialFor(options, user.entities, saved)
    }

    /** Sin sesión (pantalla de entrada): de vuelta al dorado de Arta. */
    fun reset() {
        userId = null
        persist = false
        allowed = emptySet()
        _available.value = listOf(BizEntity.ARTA)
        _current.value = BizEntity.ARTA
    }

    /** Cambia a [entity] si la persona puede. Devuelve true si de verdad cambió. */
    fun select(entity: BizEntity): Boolean {
        if (entity == current || entity !in available) return false
        _current.value = entity
        val id = userId
        if (persist && id != null) prefs?.edit()?.putString(KEY_PREFIX + id, entity.key)?.apply()
        return true
    }

    // ─── Reglas puras (probadas en ActiveEntityTest) ────────────────────────

    internal fun isTopRole(roleKey: String?): Boolean = roleKey.orEmpty() in TOP_ROLES

    /** Las que el API acepta en `?entity=`: dirección general y plataforma, todas; el resto, las suyas. */
    internal fun allowedFor(roleKey: String?, entities: List<String>): Set<BizEntity> =
        if (isTopRole(roleKey)) BizEntity.entries.toSet() else entities.mapNotNull(BizEntity::of).toSet()

    /** Entre cuáles puede cambiar, en orden fijo (Arta, Auditorio). Nunca vacía. */
    internal fun availableFor(roleKey: String?, entities: List<String>): List<BizEntity> {
        val allowed = allowedFor(roleKey, entities)
        return BizEntity.entries.filter { it in allowed }.ifEmpty { listOf(BizEntity.ARTA) }
    }

    /** La guardada si sigue valiendo; si no, la primera de las suyas (ARTA si tiene las dos). */
    internal fun initialFor(options: List<BizEntity>, entities: List<String>, saved: BizEntity?): BizEntity {
        if (saved != null && saved in options) return saved
        val own = entities.mapNotNull(BizEntity::of).filter { it in options }
        return when {
            BizEntity.ARTA in own && BizEntity.EXPLANADA in own -> BizEntity.ARTA
            own.isNotEmpty() -> own.first()
            else -> options.first()
        }
    }
}
