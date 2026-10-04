import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

// Sin google-services.json la app compila y funciona, solo que sin push: el
// plugin de Firebase exige el archivo y lo rompería todo en una máquina nueva.
val hasFirebaseConfig = file("google-services.json").exists()
if (hasFirebaseConfig) {
    apply(plugin = "com.google.gms.google-services")
}

val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    FileInputStream(keystorePropertiesFile).use { keystoreProperties.load(it) }
}
// Si falta una clave, el preflight lo dice con nombre en vez de reventar al
// configurar con un «null cannot be cast to String».
val missingSigningKeys = listOf("storeFile", "storePassword", "keyAlias", "keyPassword")
    .filter { keystoreProperties.getProperty(it).isNullOrBlank() }
val uploadKeystoreFile: File? = keystoreProperties.getProperty("storeFile")?.takeIf { it.isNotBlank() }?.let { rootProject.file(it) }
val hasUploadKey = keystorePropertiesFile.exists() && missingSigningKeys.isEmpty() && uploadKeystoreFile?.exists() == true

// -PVERSION_CODE=N -PVERSION_NAME=X.Y.Z gana sobre gradle.properties.
val rawVersionCode: String? = (project.findProperty("VERSION_CODE") as String?)?.trim()
val declaredVersionCode: Int? = rawVersionCode?.toIntOrNull()?.takeIf { it > 0 }
val declaredVersionName: String? = (project.findProperty("VERSION_NAME") as String?)?.trim()?.ifBlank { null }

android {
    namespace = "com.artaproducciones.ops"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.artaproducciones.ops"
        minSdk = 26
        targetSdk = 36
        // El fallback es solo para que `assembleDebug` funcione en cualquier
        // máquina. En release el preflight del final aborta si no hay versión.
        versionCode = declaredVersionCode ?: 1
        versionName = declaredVersionName ?: "0.1.0"

        // Base del API con /api (Traefik lo quita antes de llegar a Nest).
        buildConfigField("String", "API_BASE_URL", "\"https://arta.artaproducciones.com/api\"")
        buildConfigField("boolean", "HAS_FIREBASE", hasFirebaseConfig.toString())
    }

    signingConfigs {
        create("release") {
            if (hasUploadKey) {
                storeFile = uploadKeystoreFile
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            // API local del docker de desarrollo: -PDEV_API_BASE_URL=http://10.0.2.2:4000/api
            val devApiBaseUrl = (project.findProperty("DEV_API_BASE_URL") as String?)?.trim()?.ifBlank { null }
            if (devApiBaseUrl != null) {
                buildConfigField("String", "API_BASE_URL", "\"$devApiBaseUrl\"")
            }
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // NUNCA la llave de debug: Play rechaza ese AAB con «el certificado
            // de subida no coincide», y solo después de subirlo. Sin llave el
            // release queda sin firma y el preflight del final aborta el build.
            signingConfig = if (hasUploadKey) signingConfigs.getByName("release") else null
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    lint {
        abortOnError = false
    }

    packaging {
        resources {
            excludes += setOf("/META-INF/{AL2.0,LGPL2.1}")
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.02.00")
    implementation(composeBom)

    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.activity:activity-compose:1.11.0")
    implementation("com.google.android.material:material:1.12.0")

    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("androidx.compose.material3:material3:1.3.2")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("io.coil-kt:coil-compose:2.7.0")
    // Video y notas de voz del chat: mp4/mov/webm/m4a/ogg con la misma sesión (OkHttp) y rangos.
    implementation("androidx.media3:media3-exoplayer:1.6.1")
    implementation("androidx.media3:media3-ui:1.6.1")
    implementation("androidx.media3:media3-datasource-okhttp:1.6.1")

    // Tirar para actualizar en la vista web (WebView no participa del nested scroll de Compose).
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.navigation:navigation-compose:2.9.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.9.0")
    implementation("androidx.lifecycle:lifecycle-process:2.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-moshi:2.11.0")
    implementation("com.squareup.moshi:moshi-kotlin:1.15.2")

    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("io.socket:socket.io-client:2.1.0") {
        exclude(group = "org.json", module = "json")
    }

    implementation(platform("com.google.firebase:firebase-bom:33.5.1"))
    implementation("com.google.firebase:firebase-messaging-ktx")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}

// ===========================================================================
// Preflight de release (igual que NEXARA)
//
// Dos formas de llegar a Play con un AAB inservible sin que el build se queje:
//
//   1. Sin `key.properties` (o sin el .jks) el AAB saldría sin la llave de
//      subida y Play lo rechaza, pero solo después de subirlo.
//   2. Sin VERSION_CODE el fallback pone `1` y Play rechaza cualquier
//      versionCode ya subido, aunque el bundle se hubiera descartado.
//
// Ninguna rompe la compilación, así que se rompe a propósito. Solo actúa si el
// grafo va a EMPAQUETAR un release (APK o AAB): debug, tests unitarios y
// `signingReport` no pasan por aquí.
// ===========================================================================
gradle.taskGraph.whenReady {
    val releasePackagingTasks = setOf("packageRelease", "packageReleaseBundle", "signReleaseBundle")
    val packagesRelease = allTasks.any { it.project == project && it.name in releasePackagingTasks }
    if (!packagesRelease) return@whenReady

    val problems = mutableListOf<String>()

    if (!keystorePropertiesFile.exists()) {
        problems += """
            |Falta ${keystorePropertiesFile.path}
            |  Sin ese fichero el release no se firma con la llave de subida de Play
            |  (arta-upload.jks). Recupéralo del respaldo; NO generes otro keystore:
            |  una llave nueva no puede actualizar la app ya registrada en Play.
        """.trimMargin()
    } else if (missingSigningKeys.isNotEmpty()) {
        problems += """
            |key.properties incompleto: faltan ${missingSigningKeys.joinToString(", ")}.
            |  Debe declarar storeFile, storePassword, keyAlias y keyPassword.
        """.trimMargin()
    } else if (uploadKeystoreFile?.exists() != true) {
        problems += """
            |key.properties apunta a un keystore que no existe: ${uploadKeystoreFile?.path}
            |  Copia ahí arta-upload.jks desde el respaldo.
        """.trimMargin()
    }

    if (declaredVersionCode == null) {
        problems += """
            |VERSION_CODE sin declarar o inválido (valor: «${rawVersionCode ?: ""}»).
            |  Decláralo en gradle.properties o pásalo al build: -PVERSION_CODE=N
            |  (entero mayor que 0 y mayor que el último subido a Play).
        """.trimMargin()
    }

    if (declaredVersionName == null) {
        problems += """
            |VERSION_NAME sin declarar.
            |  Decláralo en gradle.properties o pásalo al build: -PVERSION_NAME=X.Y.Z
        """.trimMargin()
    }

    if (problems.isNotEmpty()) {
        throw GradleException(
            buildString {
                appendLine()
                appendLine("=".repeat(72))
                appendLine("PREFLIGHT DE RELEASE FALLIDO — el release no se generó a propósito.")
                appendLine("=".repeat(72))
                problems.forEach {
                    appendLine()
                    appendLine(it)
                }
                appendLine()
                appendLine("=".repeat(72))
            },
        )
    }

    logger.lifecycle("Preflight de release OK — versionCode=$declaredVersionCode versionName=$declaredVersionName")
}
