import type { ClientInput, ClientKind, ClientStatus } from "@juris-connect/shared";

export type { ClientInput, ClientKind, ClientStatus };

export type ClientRecord = {
  id: string;
  name: string;
  kind: ClientKind;
  document: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  ventures: string[];
  venturesAvailable?: boolean;
  relatedCases?: number;
  status: ClientStatus;
  createdAt: string;
  updatedAt?: string;
};
