rootProject.name = "vck-verifier"

/*
 * vck (und darin signum) werden als Composite Build aus dem Quellcode gebaut, nicht aus Maven Central.
 * Erwartet die Klone nebeneinander: <dir>/vck und <dir>/signum. VCK_DIR überschreibt den Pfad,
 * sonst wird ab diesem Ordner aufwärts nach einem Geschwister-Ordner "vck" gesucht
 * (passt für das Repo selbst und für Worktrees unter .claude/worktrees/).
 */
val vckDir: File? = System.getenv("VCK_DIR")?.let(::file)
    ?: generateSequence(rootDir.absoluteFile) { it.parentFile }
        .map { File(it.parentFile ?: return@map null, "vck") }
        .filterNotNull()
        .firstOrNull { File(it, "settings.gradle.kts").exists() }

if (vckDir != null) {
    logger.lifecycle("vck-verifier: vck als Composite Build aus ${vckDir.absolutePath}")
    includeBuild(vckDir)
} else {
    logger.warn("vck-verifier: kein vck-Klon gefunden, nutze veröffentlichte Artefakte aus Maven Central")
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}
