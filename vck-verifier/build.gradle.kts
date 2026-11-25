plugins {
    kotlin("jvm") version "2.4.10"
    kotlin("plugin.serialization") version "2.4.10"
    application
}

group = "at.asitplus.demo"
version = "0.1.0"

val ktorVersion = "3.5.2"

dependencies {
    // mit Composite Build aus ../vck aufgelöst, sonst aus Maven Central
    implementation("at.asitplus.wallet:vck-openid:9.0.0")
    implementation("io.ktor:ktor-server-core:$ktorVersion")
    implementation("io.ktor:ktor-server-cio:$ktorVersion")
    implementation("org.slf4j:slf4j-simple:2.0.17")
}

kotlin {
    jvmToolchain(17)
}

application {
    mainClass.set("at.asitplus.demo.verifier.MainKt")
}
