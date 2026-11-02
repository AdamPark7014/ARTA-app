package com.artaproducciones.ops.ui.modules

import com.artaproducciones.ops.data.api.EventDetailDto
import com.artaproducciones.ops.data.api.PoDetailDto
import com.artaproducciones.ops.data.api.WitnessDto
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Adendum, boletera y testigos: los campos nuevos son opcionales y un API viejo no tumba la pantalla. */
class EventModulesDtoTest {
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    @Test
    fun anOldEventResponseStillDecodes() {
        val event = moshi.adapter(EventDetailDto::class.java).fromJson(
            """{ "id": "e1", "name": "Show", "purchaseOrders": [ { "id": "p1", "status": "PAID", "amount": "10.00" } ] }""",
        )!!
        assertNull(event.boleteraUrl)
        assertNull(event.purchaseOrders.single().paymentMethod)
        assertNull(event.purchaseOrders.single().adendumPerson)
    }

    @Test
    fun readsTheAdendumAndTheBoletera() {
        val event = moshi.adapter(EventDetailDto::class.java).fromJson(
            """
            {
              "id": "e1", "name": "Show", "boleteraUrl": "https://boletos.example/show",
              "purchaseOrders": [
                {
                  "id": "p1", "status": "AUTHORIZED", "amount": "1500.50", "paymentMethod": "ADENDUM",
                  "adendumPerson": "Ana López", "adendumAccount": "012345", "adendumFileUrl": "/uploads/a.pdf",
                  "adendumFileName": "a.pdf", "createdAt": "2026-11-01T18:00:00.000Z"
                }
              ]
            }
            """.trimIndent(),
        )!!
        assertEquals("https://boletos.example/show", event.boleteraUrl)
        val po = event.purchaseOrders.single()
        assertEquals("Ana López", po.adendumPerson)
        assertEquals("012345", po.adendumAccount)
        assertEquals("/uploads/a.pdf", po.adendumFileUrl)
        assertEquals("a.pdf", po.adendumFileName)
    }

    @Test
    fun anOldPurchaseOrderStillDecodes() {
        val po = moshi.adapter(PoDetailDto::class.java).fromJson("""{ "id": "p1", "status": "PAID", "paymentMethod": "EFECTIVO" }""")!!
        assertNull(po.adendumPerson)
        assertNull(po.adendumFileUrl)
    }

    @Test
    fun readsTheWitnesses() {
        val type = Types.newParameterizedType(List::class.java, WitnessDto::class.java)
        val list = moshi.adapter<List<WitnessDto>>(type).fromJson(
            """
            [
              {
                "id": "w1", "medium": "PENDON", "title": "Pendón centro", "note": null, "link": null,
                "fileUrl": "/uploads/w.jpg", "fileName": "w.jpg", "mimeType": "image/jpeg",
                "publishedAt": "2026-10-30T00:00:00.000Z", "isPublic": true, "createdAt": "2026-10-30T10:00:00.000Z",
                "createdBy": { "id": "u1", "fullName": "Ana López" }, "eventId": "e1"
              },
              { "id": "w2" }
            ]
            """.trimIndent(),
        )!!
        assertEquals("Pendones", witnessMediumLabel(list[0].medium))
        assertTrue(list[0].isPublic)
        assertEquals("Ana López", list[0].createdBy?.fullName)
        assertEquals("Otros", witnessMediumLabel(list[1].medium))
        assertFalse(list[1].isPublic)
    }

    @Test
    fun adendumIsAPaymentMethodThatNeedsProof() {
        assertEquals("Adendum", poPaymentLabel("ADENDUM"))
        assertEquals("Transferencia", poPaymentLabel(null))
        assertTrue(poNeedsProof("ADENDUM"))
    }
}
