package com.artaproducciones.ops.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A dónde lleva cada liga del panel (`docs/PARIDAD-MOVIL-CONTRATO.md` §4 y `AppRouter` en iOS). Se prueba
 * [DeepLink.resolve], que ya recibe la ruta relativa: [DeepLink.parse] solo le quita el origen a las absolutas.
 */
class DeepLinkTest {
    private fun link(path: String, type: String? = null) = DeepLink.resolve(path, type)

    @Test
    fun theTabsOfTheShell() {
        assertEquals(DeepLink.Section(Tab.Inicio), link("/dashboard"))
        assertEquals(DeepLink.Section(Tab.Inicio), link("/"))
        assertEquals(DeepLink.Section(Tab.Inicio), link(""))
        assertEquals(DeepLink.Section(Tab.Chats), link("/chat"))
        assertEquals(DeepLink.Section(Tab.Tareas), link("/tasks"))
        assertEquals(DeepLink.Section(Tab.Avisos), link("/notifications"))
        assertEquals(DeepLink.SentNotices, link("/notifications?tab=enviados"))
        // Sin la diagonal inicial también se entiende.
        assertEquals(DeepLink.Section(Tab.Tareas), link("tasks"))
    }

    @Test
    fun chatLinksCarryChannelMessageAndThread() {
        assertEquals(DeepLink.Chat("c1", "m2", "t3"), link("/chat?channel=c1&msg=m2&thread=t3"))
        assertEquals(DeepLink.Chat("c1", null, null), link("/chat?channel=c1&msg="))
    }

    /** `/tasks/new` es el alta, no una tarea con id «new»; `?filtro=` y `?vista=` llegan a la pestaña. */
    @Test
    fun tasksLinks() {
        assertEquals(DeepLink.Task("t1"), link("/tasks/t1"))
        assertEquals(DeepLink.Task("t1"), link("/tasks?task=t1"))
        assertEquals(DeepLink.Tasks(compose = true), link("/tasks/new"))
        assertEquals(DeepLink.Tasks(filter = "vencidas"), link("/tasks?filtro=vencidas"))
        assertEquals(DeepLink.Tasks(filter = "vencidas", view = "equipo"), link("/tasks?filtro=vencidas&vista=equipo"))
        assertEquals(DeepLink.Tasks(view = "pedidas"), link("/tasks?vista=pedidas"))
        // Un filtro que la app no conoce viaja igual: la pestaña lo ignora (`StatusFilter.fromKey` → null).
        assertEquals(DeepLink.Tasks(filter = "xyz"), link("/tasks?filtro=xyz"))
        // Una tarea concreta gana sobre el filtro.
        assertEquals(DeepLink.Task("t1"), link("/tasks?filtro=vencidas&task=t1"))
    }

    /** Las pestañas nativas del hub abren el evento en esa pestaña; las de la web se quedan en la web con su `?tab=`. */
    @Test
    fun eventTabs() {
        assertEquals(DeepLink.Event("e1"), link("/events/e1"))
        assertEquals(DeepLink.Event("e1"), link("/events/e1?tab=overview"))
        assertEquals(DeepLink.Event("e1"), link("/events/e1?tab=Resumen"))
        assertEquals(DeepLink.Event("e1", "tasks"), link("/events/e1?tab=tasks"))
        assertEquals(DeepLink.Event("e1", "adendum"), link("/events/e1?tab=adendum"))
        assertEquals(DeepLink.Event("e1", "testigos"), link("/events/e1?tab=testigos"))
        assertEquals(DeepLink.Event("e1", "team"), link("/events/e1?tab=Team"))
        assertEquals(DeepLink.Web("/events/e1?tab=ocs"), link("/events/e1?tab=ocs"))
        assertEquals(DeepLink.Web("/events/e1?tab=ocs&po=p1"), link("/events/e1?tab=ocs&po=p1"))
        // Lo que va a la web conserva su codificación tal cual.
        assertEquals(DeepLink.Web("/events/e1?tab=ocs&po=p%201"), link("/events/e1?tab=ocs&po=p%201"))
        assertEquals(DeepLink.Web("/events/e1?tab=checklists&checklist=k1"), link("/events/e1?tab=checklists&checklist=k1"))
        assertEquals(DeepLink.Web("/events/e1?tab=files"), link("/events/e1?tab=files"))
        // Una tarea dentro del evento abre la tarea; lo que no es el hub se queda en la web.
        assertEquals(DeepLink.Task("t1"), link("/events/e1?tab=tasks&task=t1"))
        assertEquals(DeepLink.Web("/events/new"), link("/events/new"))
        assertEquals(DeepLink.Web("/events/e1/algo"), link("/events/e1/algo"))
        assertEquals(DeepLink.Events, link("/events"))
        assertEquals(DeepLink.Web("/events?scope=past"), link("/events?scope=past"))
    }

    /** Una OC que espera mi decisión abre su detalle en Aprobaciones; `po.aging` es la misma OC que sigue esperando. */
    @Test
    fun purchaseOrdersAndAdvances() {
        assertEquals(DeepLink.Po("p1"), link("/purchase-orders?po=p1", "po.requested"))
        assertEquals(DeepLink.Po("p1"), link("/purchase-orders?po=p1", "po.aging"))
        assertEquals(DeepLink.Po("p1"), link("/purchase-orders?po=p1", "PO.Updated"))
        assertEquals(DeepLink.Approvals, link("/purchase-orders", "po.requested"))
        // La liga real del API cuando son varias OC envejecidas: la lista, sin una en particular.
        assertEquals(DeepLink.Approvals, link("/purchase-orders?estado=unauthorized", "po.aging"))
        assertEquals(DeepLink.Advance("a1"), link("/advances?advance=a1", "advance.requested"))
        assertEquals(DeepLink.Advance("a1"), link("/advances?advance=a1", "advance.to_pay"))
        assertEquals(DeepLink.Approvals, link("/advances", "advance.requested"))
        // Pagar y transferir se hacen en la orden, en la web; y sin `type` (Avisos › Enviados) nada es pendiente.
        assertEquals(DeepLink.Web("/purchase-orders?po=p1"), link("/purchase-orders?po=p1", "po.to_pay"))
        assertEquals(DeepLink.Web("/purchase-orders?po=p1"), link("/purchase-orders?po=p1", "po.to_transfer"))
        assertEquals(DeepLink.Web("/purchase-orders?po=p1"), link("/purchase-orders?po=p1", null))
        assertEquals(DeepLink.Web("/purchase-orders"), link("/purchase-orders"))
    }

    @Test
    fun whatLivesInTheWebStaysInTheWeb() {
        assertEquals(DeepLink.Web("/calendar?date=2026-11-07"), link("/calendar?date=2026-11-07"))
        assertEquals(DeepLink.Web("/finanzas"), link("/finanzas"))
        // El fragmento no viaja; los espacios de los extremos tampoco.
        assertEquals(DeepLink.Web("/finanzas"), link(" /finanzas#arriba "))
        assertTrue(link("/finanzas") is DeepLink.Web)
        assertTrue(link("/events/e1").isNative)
    }

    @Test
    fun percentEncodedIdsAreDecoded() {
        assertEquals(DeepLink.Task("a b"), link("/tasks/a%20b"))
        assertEquals(DeepLink.Chat("c1", "m+2", null), link("/chat?channel=c1&msg=m+2"))
    }

    /** El botón «Abrir» de un push a Aprobaciones cae en la OC o el anticipo del aviso, no en la lista. */
    @Test
    fun aForcedApprovalLandsOnTheExactItem() {
        assertEquals(DeepLink.Po("p1"), DeepLink.from(null, null, "/purchase-orders?po=p1", type = "po.aging", forceApprovals = true))
        assertEquals(DeepLink.Advance("a1"), DeepLink.from(null, null, "/advances?advance=a1", type = "advance.requested", forceApprovals = true))
        assertEquals(DeepLink.Task("t1"), DeepLink.from(null, null, "/tasks/t1", type = "task.submitted", forceApprovals = true))
        assertEquals(DeepLink.Approvals, DeepLink.from(null, null, "/events/e1?tab=checklists", type = "checklist.submitted", forceApprovals = true))
        assertEquals(DeepLink.Approvals, DeepLink.from(null, null, null, forceApprovals = true))
    }

    @Test
    fun aConversationWinsOverTheUrl() {
        assertEquals(DeepLink.Chat("c1", "m1", "root"), DeepLink.from("c1", "m1", "/tasks/t1", parentId = "root"))
        assertEquals(DeepLink.Chat("c1", null, null), DeepLink.from("c1", "", "/tasks/t1", parentId = ""))
        assertNull(DeepLink.from(null, null, null))
        assertNull(DeepLink.from("", null, "  "))
    }
}
