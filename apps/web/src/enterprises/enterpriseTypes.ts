import type { EnterpriseInput as SharedEnterpriseInput, ClientStatus } from "@juris-connect/shared";

export type EnterpriseStatus = ClientStatus;
export type EnterpriseInput = SharedEnterpriseInput;
export type EnterpriseCreateInput = EnterpriseInput & { createdAt?: string };
export type EnterpriseRecord = EnterpriseInput & { id: string; createdAt: string; updatedAt?: string };
