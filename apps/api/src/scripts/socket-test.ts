import { io } from "socket.io-client";
import { SOCKET_EVENTS } from "@juris-connect/shared";

const [userId, channelId, text] = process.argv.slice(2);

if (!userId || !channelId) {
  console.error("Uso: socket-test.ts <userId> <channelId> [mensagem]");
  process.exit(1);
}

const socket = io("http://localhost:3333", { auth: { userId } });

socket.on("connect_error", (err) => {
  console.error("Erro de conexão:", err.message);
  process.exit(1);
});

socket.on(SOCKET_EVENTS.newMessage, (msg) => {
  console.log("Nova mensagem:", msg);
});

socket.on("connect", () => {
  socket.emit(SOCKET_EVENTS.joinChannel, channelId, (res: unknown) => {
    console.log("join:", res);
    if (text) {
      socket.emit(
        SOCKET_EVENTS.sendMessage,
        { channelId, content: text },
        (r: unknown) => console.log("send:", r),
      );
    }
  });
});