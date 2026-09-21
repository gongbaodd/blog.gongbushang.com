// Preflight for the E2E suite: fail before `start-server-and-test` boots the
// preview server if something else already listens on the fixed dev port.
// Without this check the other server would be mistaken for our build and the
// suite would test the wrong site.
import net from "node:net";
import process from "node:process";

const HOST = "127.0.0.1";
const PORT = Number.parseInt(process.env.E2E_PORT ?? "4321", 10);

function exitUnused() {
  console.log(`Port ${HOST}:${PORT} is free, the E2E preview server can start.`);
  process.exit(0);
}

function exitOccupied() {
  console.error(
    `Refusing to start: ${HOST}:${PORT} is already in use by another server.\n` +
      `Stop that process, or point the suite at another port with E2E_PORT and E2E_BASE_URL.`,
  );
  process.exit(1);
}

const socket = net.connect({ host: HOST, port: PORT });

socket.on("connect", () => {
  socket.destroy();
  exitOccupied();
});

socket.on("error", () => {
  socket.destroy();
  exitUnused();
});

socket.setTimeout(1000, () => {
  socket.destroy();
  exitUnused();
});
