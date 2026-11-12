export type ClientKind = "Empresa" | "Pessoa física" | "Condomínio" | "Órgão público";
export type ClientStatus = "active" | "inactive";

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
  relatedCases?: number;
  status: ClientStatus;
  createdAt: string;
};

export type ClientInput = Omit<ClientRecord, "id" | "createdAt" | "ventures" | "relatedCases">;
