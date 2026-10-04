package com.artaproducciones.ops.ui.modules

import com.artaproducciones.ops.data.api.AdvanceDto
import com.artaproducciones.ops.data.api.ModulesMe
import com.artaproducciones.ops.push.PushPayload
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AdvancesTest {

    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
    private val listAdapter = moshi.adapter<List<AdvanceDto>>(Types.newParameterizedType(List::class.java, AdvanceDto::class.java))

    @Test
    fun parsesPendingListWithDecimalAsStringAndNulls() {
        val json = """
            [
              {
                "id": "a1", "eventId": "e1", "label": "Hospedaje banda", "amount": "1234.50",
                "fileUrl": null, "note": "Dos noches", "advanceStatus": "PENDING",
                "createdAt": "2026-10-04T18:00:00.000Z", "decidedAt": null, "rejectReason": null,
                "paidAt": null, "paidProofUrl": null,
                "uploadedBy": { "id": "u1", "fullName": "Ana López" }, "decidedBy": null, "paidBy": null,
                "event": { "id": "e1", "name": "Concierto", "entity": "ARTA" }
              },
              { "id": "a2", "amount": 800, "advanceStatus": "APPROVED", "extra": true }
            ]
        """.trimIndent()

        val list = listAdapter.fromJson(json)!!

        val a = list[0]
        assertEquals("1234.50", a.amount)
        assertEquals("Ana López", a.uploadedBy?.fullName)
        assertEquals("Concierto", a.event?.name)
        assertNull(a.fileUrl)
        assertNull(a.decidedBy)
        assertEquals("800", list[1].amount)
        assertNull(list[1].event)
        assertNull(list[1].label)
        assertEquals("Anticipo", list[1].conceptLabel())
    }

    @Test
    fun formatsAmountAsMxn() {
        assertEquals(1234.5, advanceAmount("1234.50")!!, 0.0)
        assertEquals(1234.5, advanceAmount(" 1,234.50 ")!!, 0.0)
        assertNull(advanceAmount(null))
        assertNull(advanceAmount("abc"))
        assertTrue(advanceAmountLabel("1234.50").contains("1,234.50"))
        assertTrue(advanceAmountLabel("1234.50").contains("$"))
        assertEquals("—", advanceAmountLabel(null))
    }

    @Test
    fun rejectReasonNeedsThreeCharacters() {
        assertFalse(advanceReasonValid(""))
        assertFalse(advanceReasonValid("  no  "))
        assertTrue(advanceReasonValid("sin factura"))
    }

    @Test
    fun actionableAdvancesPutPendingFirstAndCountInPending() {
        val data = ApprovalsData(
            tasksToReview = emptyList(),
            requested = emptyList(),
            orders = emptyList(),
            canPayNow = true,
            advances = listOf(
                AdvanceDto("paid", advanceStatus = "PAID"),
                AdvanceDto("toPay", advanceStatus = "APPROVED", createdAt = "2026-10-01T00:00:00Z"),
                AdvanceDto("newer", advanceStatus = "PENDING", createdAt = "2026-10-03T00:00:00Z"),
                AdvanceDto("older", advanceStatus = "PENDING", createdAt = "2026-10-02T00:00:00Z"),
            ),
        )
        val perms = ModulesPerms(ModulesMe(id = "u1", roleKey = "dir_general", entities = listOf("ARTA")))

        assertEquals(listOf("older", "newer", "toPay"), data.actionableAdvances.map { it.id })
        assertEquals(3, data.pendingCount(perms))
        assertEquals(1, data.advanceListIndex(perms, "older", hasError = false))
        assertEquals(4, data.advanceListIndex(perms, "toPay", hasError = true))
        assertNull(data.advanceListIndex(perms, "paid", hasError = false))
    }

    @Test
    fun advancePushTypesOpenApprovals() {
        assertTrue(PushPayload.isApprovalType("advance.requested"))
        assertTrue(PushPayload.isApprovalType("advance.to_pay"))
        assertFalse(PushPayload.isApprovalType("advance.paid"))
    }
}
