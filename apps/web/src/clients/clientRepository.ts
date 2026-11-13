import { demoClients } from "./clientDemoData";
import type { ClientRecord } from "./clientTypes";

// Mantém a referência demonstrativa síncrona usada pelos módulos ainda não persistidos.
// A página Clientes usa exclusivamente clientApi para suas operações reais.
export function getClients(): ClientRecord[] {
  return demoClients.map((client) => ({ ...client, ventures: [...client.ventures], venturesAvailable: true }));
}
