package at.asitplus.demo.verifier

import at.asitplus.data.NonEmptyList.Companion.toNonEmptyList
import at.asitplus.openid.JarRequestParameters
import at.asitplus.openid.OpenIdConstants
import at.asitplus.openid.RequestObjectParameters
import at.asitplus.openid.VerifierInfo
import at.asitplus.openid.dcql.DCQLQuery
import at.asitplus.signum.indispensable.CryptoPrivateKey
import at.asitplus.signum.indispensable.SignatureAlgorithm
import at.asitplus.signum.indispensable.josef.io.joseCompliantSerializer
import at.asitplus.signum.indispensable.pki.X509Certificate
import at.asitplus.signum.supreme.sign.signerFor
import at.asitplus.wallet.lib.NonceService
import at.asitplus.wallet.lib.agent.SignerBasedKeyMaterial
import at.asitplus.wallet.lib.data.CredentialPresentationRequest
import at.asitplus.wallet.lib.openid.AuthnResponseResult
import at.asitplus.wallet.lib.openid.ClientIdScheme
import at.asitplus.wallet.lib.openid.CreatedRequest
import at.asitplus.wallet.lib.openid.CreationOptions
import at.asitplus.wallet.lib.openid.OpenId4VpRequestOptions
import at.asitplus.wallet.lib.openid.OpenId4VpVerifier
import at.asitplus.wallet.lib.validation.CheckOutcome
import at.asitplus.wallet.lib.validation.CredentialChecks
import at.asitplus.wallet.lib.validation.NamedCheck
import at.asitplus.wallet.lib.validation.PresentationChecks
import at.asitplus.wallet.lib.validation.ProtocolResponseChecks
import at.asitplus.wallet.lib.validation.StatusPolicy
import at.asitplus.wallet.lib.validation.TrustPolicy
import at.asitplus.wallet.lib.validation.ValidatedPresentation
import at.asitplus.wallet.lib.validation.ValidationDecision
import at.asitplus.wallet.lib.validation.ValidationPolicy
import at.asitplus.wallet.lib.validation.ValidationReport
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.serializer
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import kotlin.time.Duration.Companion.seconds

/**
 * Eine OpenID4VP-Sitzung je Anfrage des Node-Servers, mit eigenem [OpenId4VpVerifier]: Profil (client_id-Schema,
 * Schlüssel) und Nonce gehören zur Sitzung.
 *
 * Vertrauen in die Aussteller entscheidet weiterhin der Node-Server (feste Liste, LoTE-Anker, Test-Aussteller des
 * Simulators): VC-K prüft hier Signaturen, Disclosures, Holder-Binding, Nonce, Audience, Session Transcript und
 * Gültigkeit ([TrustPolicy.IntegrityOnly]) und liefert die Zertifikatskette des Ausstellers mit.
 * Status Lists werden nicht abgefragt, weil der Dienst keine ausgehenden Verbindungen aufbaut.
 */
class VerifierService {

    private class Session(
        val verifier: OpenId4VpVerifier,
        val created: CreatedRequest,
        val createdAt: Long = System.currentTimeMillis(),
    )

    private val sessions = ConcurrentHashMap<String, Session>()

    private val policy = ValidationPolicy(
        trust = TrustPolicy.IntegrityOnly,
        status = StatusPolicy.Skip,
        timeLeeway = 300.seconds,
        requireTimeliness = true,
    )

    suspend fun create(body: JsonObject): JsonObject {
        sweep()
        val id = body.string("id")
        val profile = body.string("profile")
        val chain = body["x5c"]!!.jsonArray.map { X509Certificate.decodeFromDer(b64(it.jsonPrimitive.content)) }
        val keyMaterial = PemKeyMaterial(b64(body.string("keyPkcs8")), chain.first())
        val responseUri = body.string("responseUri")
        val clientIdScheme = when (profile) {
            "eudi" -> ClientIdScheme.CertificateHash(chain, responseUri)
            else -> ClientIdScheme.CertificateSanDns(chain, body.string("clientIdDns"), responseUri)
        }
        val nonce = body.optString("nonce") ?: java.util.UUID.randomUUID().toString()
        val verifier = OpenId4VpVerifier(
            clientIdScheme = clientIdScheme,
            keyMaterial = keyMaterial,
            nonceService = SingleNonceService(nonce),
            supportedAlgorithms = setOf(
                SignatureAlgorithm.ECDSAwithSHA256, SignatureAlgorithm.ECDSAwithSHA384, SignatureAlgorithm.ECDSAwithSHA512,
            ),
            presentationPolicy = policy,
        )
        val dcql = joseCompliantSerializer.decodeFromJsonElement(DCQLQuery.serializer(), body["dcqlQuery"]!!)
        val wrprc = body.optString("wrprc")
        val options = OpenId4VpRequestOptions(
            presentationRequest = CredentialPresentationRequest.DCQLRequest(dcql),
            responseMode = if (profile == "eudi") OpenIdConstants.ResponseMode.DirectPostJwt
            else OpenIdConstants.ResponseMode.DirectPost,
            responseUrl = responseUri,
            verifierInfo = wrprc?.let { listOf(VerifierInfo(format = "registration_cert", data = it)).toNonEmptyList() },
        )
        val method = when (body.optString("requestUriMethod")) {
            "post" -> JarRequestParameters.RequestUriMethod.POST
            else -> JarRequestParameters.RequestUriMethod.GET
        }
        val created = verifier.createAuthnRequest(
            options,
            CreationOptions.SignedRequestByReference(body.string("walletUrl"), body.string("requestUri"), method),
        ).getOrThrow()
        sessions[id] = Session(verifier, created)
        return buildJsonObject {
            put("url", created.url)
            put("clientId", clientIdScheme.clientId)
            put("nonce", nonce)
        }
    }

    /** Signiertes Request Object; [body] enthält ggf. die wallet_nonce (request_uri_method=post). */
    suspend fun requestObject(id: String, body: JsonObject?): String? {
        val session = sessions[id] ?: return null
        val params = body?.optString("walletNonce")?.let { RequestObjectParameters(walletNonce = it) }
        return session.created.loadRequestObject!!.invoke(params).getOrThrow()
    }

    /**
     * Antwort der Wallet (Formular-Body von direct_post bzw. direct_post.jwt), geprüft mit VC-K.
     * `processed: false` heißt: nicht zuordenbar oder verletzt den Schutz der Anfrage (Wallet bekommt 400).
     */
    suspend fun response(id: String, formBody: String): JsonObject? {
        val session = sessions[id] ?: return null
        val result = session.verifier.validateAuthnResponse(formBody)
        return result.fold(
            onFailure = { buildJsonObject { put("processed", false); put("error", it.message ?: it::class.simpleName) } },
            onSuccess = { it.toJson() },
        )
    }

    private fun AuthnResponseResult.toJson(): JsonObject = when (this) {
        is AuthnResponseResult.Error -> buildJsonObject {
            put("processed", true)
            put("walletError", buildJsonObject {
                put("error", error.error)
                error.errorDescription?.let { put("description", it) }
            })
        }

        is AuthnResponseResult.Success -> buildJsonObject {
            put("processed", true)
            put("state", request.state)
            put("accepted", validationReport.decision == ValidationDecision.ACCEPTED)
            put("checks", validationReport.ownChecks())
            put("credentials", buildJsonObject {
                presentationValidations.forEach { (queryId, presentations) ->
                    putJsonArray(queryId.string) {
                        presentations.forEach { p ->
                            add(buildJsonObject {
                                put("accepted", p.report.decision == ValidationDecision.ACCEPTED)
                                // Prüfungen der Präsentation (Holder-Binding, Nonce, Audience) und der enthaltenen Nachweise
                                put("checks", JsonArray(p.report.allChecks()))
                                p.presentation?.let { putPresentation(it) }
                            })
                        }
                    }
                }
            })
        }
    }

    private fun kotlinx.serialization.json.JsonObjectBuilder.putPresentation(p: ValidatedPresentation) {
        when (p) {
            is ValidatedPresentation.SdJwt -> {
                put("format", "dc+sd-jwt")
                val claims = p.credential.reconstructedJsonObject
                    .filterKeys { it !in setOf("iss", "iat", "exp", "nbf", "cnf", "vct", "vct#integrity", "status", "_sd_alg") }
                put("claims", JsonObject(claims))
                put("issuer", p.credential.credential.issuer)
                put("x5c", certificateChain(p.credential.sdJwtSigned.jws.jwsHeader.certificateChain?.map { it.encodeToDer() }))
            }

            is ValidatedPresentation.MdocDocument -> {
                put("format", "mso_mdoc")
                put("docType", p.document.docType)
                val namespaces = buildJsonObject {
                    p.credential.issuerSigned.namespaces?.forEach { (ns, list) ->
                        put(ns, buildJsonObject {
                            list.entries.forEach { put(it.value.elementIdentifier, it.value.elementValue.toJson()) }
                        })
                    }
                }
                put("namespaces", namespaces)
                put("claims", JsonObject(namespaces.values.flatMap { it.jsonObject.entries }.associate { it.key to it.value }))
                val auth = p.credential.issuerSigned.issuerAuth
                put("x5c", certificateChain(auth.unprotectedHeader?.certificateChain ?: auth.protectedHeader.certificateChain))
            }

            else -> put("format", p::class.simpleName)
        }
    }

    private fun certificateChain(ders: List<ByteArray>?) =
        JsonArray(ders.orEmpty().map { JsonPrimitive(Base64.getEncoder().encodeToString(it)) })

    private fun sweep() {
        val limit = System.currentTimeMillis() - 15 * 60_000
        sessions.entries.removeIf { it.value.createdAt < limit }
    }
}

/** Die Nonce, die der Node-Server vorgibt (oder erzeugt hat), einmal gültig. */
private class SingleNonceService(private val nonce: String) : NonceService {
    @Volatile private var used = false
    override suspend fun provideNonce() = nonce
    override suspend fun verifyNonce(it: String) = !used && it == nonce
    override suspend fun verifyAndRemoveNonce(it: String) = synchronized(this) {
        (!used && it == nonce).also { ok -> if (ok) used = true }
    }
}

/** Schlüssel (PKCS#8, mit öffentlichem Schlüssel) und Zertifikat aus den Dateien des Node-Servers. */
private class PemKeyMaterial(pkcs8: ByteArray, private val certificate: X509Certificate) : SignerBasedKeyMaterial(
    SignatureAlgorithm.ECDSAwithSHA256.signerFor(
        CryptoPrivateKey.decodeFromDer(pkcs8) as CryptoPrivateKey.WithPublicKey<*>
    ).getOrThrow()
) {
    override suspend fun getCertificate() = certificate
}

/** Ebene eines Berichtsknotens: Antwort, Präsentation (Holder-Nachweis) oder Nachweis (Aussteller). */
private val ValidationReport.scope
    get() = when (checks) {
        is ProtocolResponseChecks -> "response"
        is PresentationChecks -> "presentation"
        is CredentialChecks -> "credential"
        else -> checks::class.simpleName ?: "other"
    }

/** Prüfungen eines Berichtsknotens, für die Anzeige im Prüfprotokoll. */
private fun ValidationReport.ownChecks(): JsonArray = JsonArray(namedChecks.map { it.toJson(scope) })

/** Prüfungen eines Berichts samt allen Unterberichten (Präsentation → Nachweise). */
private fun ValidationReport.allChecks(): List<JsonElement> =
    namedChecks.map { it.toJson(scope) } + children.flatMap { it.allChecks() }

private fun NamedCheck.toJson(scope: String) = buildJsonObject {
    put("scope", scope)
    put("name", name)
    put("ok", when (outcome) {
        CheckOutcome.Passed -> JsonPrimitive(true)
        is CheckOutcome.Failed -> JsonPrimitive(false)
        is CheckOutcome.Blocked -> if (satisfied) JsonNull else JsonPrimitive(false)
        CheckOutcome.NotApplicable -> JsonNull
    })
    put("applicable", outcome != CheckOutcome.NotApplicable)
    put("requirement", requirement.toString())
    when (val o = outcome) {
        is CheckOutcome.Failed -> put("detail", o.throwable.message ?: o.throwable::class.simpleName)
        is CheckOutcome.Blocked -> o.cause?.let { put("detail", it.message ?: it::class.simpleName) }
        else -> {}
    }
    disclosedItem?.let { put("item", it.toString()) }
}

/** mdoc-Datenelemente als JSON: einfache Werte direkt, Datumsangaben als ISO-String, Strukturen über ihren Serializer. */
private fun Any?.toJson(): JsonElement = when (this) {
    null -> JsonNull
    is String -> JsonPrimitive(this)
    is Number -> JsonPrimitive(this)
    is Boolean -> JsonPrimitive(this)
    is ByteArray -> JsonPrimitive(Base64.getEncoder().encodeToString(this))
    is Array<*> -> buildJsonArray { this@toJson.forEach { add(it.toJson()) } }
    is Iterable<*> -> buildJsonArray { this@toJson.forEach { add(it.toJson()) } }
    is Map<*, *> -> JsonObject(this.entries.associate { it.key.toString() to it.value.toJson() })
    is kotlinx.datetime.LocalDate, is kotlin.time.Instant -> JsonPrimitive(this.toString())
    else -> runCatching { joseCompliantSerializer.encodeToJsonElement(serializer(this::class.java), this) }
        .getOrElse { JsonPrimitive(this.toString()) }
}

private fun b64(s: String): ByteArray = Base64.getDecoder().decode(s)
private fun JsonObject.string(key: String) = optString(key) ?: throw IllegalArgumentException("$key fehlt")
private fun JsonObject.optString(key: String) = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content
