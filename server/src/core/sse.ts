type Client = { id: number; write: (data: string) => void; close: () => void };

const clients = new Set<Client>();
let nextId = 1;

export function addClient(write: (data: string) => void, close: () => void): Client {
  const c: Client = { id: nextId++, write, close };
  clients.add(c);
  return c;
}

export function removeClient(c: Client): void {
  clients.delete(c);
}

export function broadcast(type: "span" | "metric" | "event", data: unknown): void {
  if (clients.size === 0) return;
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) {
    try {
      c.write(payload);
    } catch {
      // ignore — client will be cleaned on close
    }
  }
}

export function clientCount(): number {
  return clients.size;
}
