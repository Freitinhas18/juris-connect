export type ModuleKey =
  | "dashboard"
  | "clients"
  | "developments"
  | "cases"
  | "tasks"
  | "conditions"
  | "documents"
  | "communication"
  | "settings";

export const navigation = [
  { key: "dashboard", label: "Dashboard", icon: "grid" },
  { key: "clients", label: "Clientes", icon: "users" },
  { key: "developments", label: "Empreendimentos", icon: "building" },
  { key: "cases", label: "Processos", icon: "briefcase", badge: "24" },
  { key: "tasks", label: "Tarefas", icon: "check", badge: "8" },
  { key: "conditions", label: "Condicionantes", icon: "shield" },
  { key: "documents", label: "Documentos", icon: "file" },
  { key: "communication", label: "Comunicação", icon: "message" },
  { key: "settings", label: "Configurações", icon: "settings" },
] as const;

// Conteúdo demonstrativo da interface. Não representa registros do banco.
export const demoMetrics = [
  { label: "Processos ativos", value: "128", change: "+12,8%", note: "vs. mês anterior", icon: "briefcase", tone: "violet" },
  { label: "Tarefas pendentes", value: "36", change: "8 hoje", note: "tarefas em aberto", icon: "check", tone: "blue" },
  { label: "Prazos próximos", value: "12", change: "3 urgentes", note: "nos próximos 7 dias", icon: "calendar", tone: "amber" },
  { label: "Condicionantes", value: "42", change: "5 atenção", note: "em acompanhamento", icon: "shield", tone: "green" },
] as const;

export const demoCases = [
  { number: "1028457-32.2024.8.26.0100", subject: "Ação de obrigação de fazer", client: "Residencial Aurora", area: "Cível", deadline: "Hoje, 16:00", priority: "Urgente", initials: "RA", color: "lavender" },
  { number: "0001924-81.2023.5.02.0038", subject: "Reclamação trabalhista", client: "Grupo Horizonte", area: "Trabalhista", deadline: "Amanhã", priority: "Alta", initials: "GH", color: "peach" },
  { number: "1003481-09.2025.8.26.0562", subject: "Licenciamento ambiental", client: "Parque das Águas", area: "Ambiental", deadline: "18 nov, 10:30", priority: "Média", initials: "PA", color: "mint" },
  { number: "5006721-44.2024.4.03.6100", subject: "Mandado de segurança", client: "Vértice Engenharia", area: "Administrativo", deadline: "21 nov, 14:00", priority: "Baixa", initials: "VE", color: "sky" },
] as const;

export const demoActivities = [
  { initials: "MC", name: "Mariana Costa", action: "adicionou um documento em", target: "Residencial Aurora", time: "há 12 min", color: "lavender" },
  { initials: "RL", name: "Rafael Lima", action: "concluiu a tarefa", target: "Revisar minuta de contrato", time: "há 48 min", color: "mint" },
  { initials: "AF", name: "Ana Ferreira", action: "atualizou o processo", target: "Grupo Horizonte", time: "há 2 horas", color: "peach" },
];

export const demoUpcoming = [
  { day: "12", month: "NOV", title: "Audiência de conciliação", detail: "Residencial Aurora · 16:00", tone: "violet" },
  { day: "13", month: "NOV", title: "Entrega de manifestação", detail: "Grupo Horizonte · 23:59", tone: "amber" },
  { day: "18", month: "NOV", title: "Protocolo de licença", detail: "Parque das Águas · 10:30", tone: "blue" },
];
