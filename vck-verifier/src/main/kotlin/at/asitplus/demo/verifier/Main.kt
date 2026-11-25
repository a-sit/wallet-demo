package at.asitplus.demo.verifier

import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.cio.CIO
import io.ktor.server.engine.embeddedServer
import io.ktor.server.request.receiveText
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.routing
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/**
 * Interner OpenID4VP-Verifier auf Basis von VC-K.
 *
 * Läuft nur auf 127.0.0.1 und wird ausschließlich vom Node-Server angesprochen, der weiterhin die
 * Wallet-Endpunkte, Sitzungen, Oberfläche und Signatur bereitstellt. Siehe [VerifierService].
 */
fun main() {
    val port = System.getenv("VCK_VERIFIER_PORT")?.toIntOrNull() ?: 3002
    embeddedServer(CIO, port = port, host = "127.0.0.1", module = Application::module).start(wait = true)
}

private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

fun Application.module() {
    val service = VerifierService()
    routing {
        get("/health") { call.respondText("ok") }

        post("/sessions") {
            val body = json.parseToJsonElement(call.receiveText()).jsonObject
            val result = runCatching { service.create(body) }
            result.fold(
                onSuccess = { call.respondText(it.toString(), ContentType.Application.Json) },
                onFailure = { call.respondError(HttpStatusCode.BadRequest, it) },
            )
        }

        post("/sessions/{id}/request-object") {
            val id = call.parameters["id"]!!
            val body = call.receiveText().takeIf { it.isNotBlank() }?.let { json.parseToJsonElement(it).jsonObject }
            val jwt = runCatching { service.requestObject(id, body) }
            jwt.fold(
                onSuccess = {
                    if (it == null) call.respondText("unknown_session", status = HttpStatusCode.NotFound)
                    else call.respondText(it, ContentType.Text.Plain)
                },
                onFailure = { call.respondError(HttpStatusCode.InternalServerError, it) },
            )
        }

        post("/sessions/{id}/response") {
            val id = call.parameters["id"]!!
            val result = runCatching { service.response(id, call.receiveText()) }
            result.fold(
                onSuccess = {
                    if (it == null) call.respondText("unknown_session", status = HttpStatusCode.NotFound)
                    else call.respondText(it.toString(), ContentType.Application.Json)
                },
                onFailure = { call.respondError(HttpStatusCode.InternalServerError, it) },
            )
        }
    }
}

private suspend fun io.ktor.server.application.ApplicationCall.respondError(status: HttpStatusCode, t: Throwable) {
    application.environment.log.warn("vck-verifier: ${t.message}", t)
    respondText(
        JsonObject(mapOf("error" to kotlinx.serialization.json.JsonPrimitive(t.message ?: t::class.simpleName))).toString(),
        ContentType.Application.Json,
        status,
    )
}
