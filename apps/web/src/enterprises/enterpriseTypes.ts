import type { ClientStatus } from "../clients/clientTypes";

export type EnterpriseStatus = ClientStatus;

export type EnterpriseRecord = {
  id: string;
  clientId: string;
  name: string;
  type: string;
  activity: string;
  document: string;
  address: string;
  municipality: string;
  state: string;
  manager: string;
  description: string;
  status: EnterpriseStatus;
  relatedCases: number;
  createdAt: string;
};

export type EnterpriseInput = Omit<EnterpriseRecord, "id" | "createdAt">;
