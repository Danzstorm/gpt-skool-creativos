import { describe, expect, it, vi, beforeEach } from "vitest";

// El módulo construye el cliente de Redis al importarse, así que las variables
// tienen que existir ANTES del import dinámico de abajo.
process.env.UPSTASH_REDIS_REST_URL = "https://ejemplo.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "token-de-prueba";

const limitMock = vi.fn();

vi.mock("@upstash/redis", () => ({
  // Solo tiene que ser construible: el módulo lo usa como bandera de "hay Redis
  // configurado" y se lo pasa a Ratelimit, que también está simulado.
  Redis: class {},
}));

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow = () => ({});
    limit = limitMock;
  },
}));

const { checkRateLimit } = await import("./rate-limit");

describe("checkRateLimit con Redis configurado", () => {
  beforeEach(() => {
    limitMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("usa el veredicto de Redis cuando responde", async () => {
    limitMock.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 5_000 });

    const result = await checkRateLimit("clave-a", 10, 60_000);

    expect(result.ok).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it("NO tira cuando Redis falla: cae al contador en memoria", async () => {
    // EL FALLO QUE CIERRA. La llamada vive antes del try/catch de las rutas, así
    // que una excepción acá llegaba como 500 y el chat dejaba de responder. Un
    // Redis sin cuota o caído tumbaba la aplicación que venía a proteger.
    limitMock.mockRejectedValue(new Error("max daily request limit exceeded"));

    const result = await checkRateLimit("clave-b", 10, 60_000);

    expect(result.ok).toBe(true); // primer golpe de la ventana en memoria
    expect(result.remaining).toBe(9);
  });

  it("al caer en memoria sigue topando, no deja pasar todo", async () => {
    // Degradar no es rendirse: el tope pasa a ser por instancia, que es lo que
    // había antes de conectar Redis, y no "sin límite".
    limitMock.mockRejectedValue(new Error("network down"));

    const limite = 3;
    const resultados = [];
    for (let i = 0; i < limite + 2; i++) {
      resultados.push(await checkRateLimit("clave-c", limite, 60_000));
    }

    expect(resultados.filter((r) => r.ok)).toHaveLength(limite);
    expect(resultados.at(-1)!.ok).toBe(false);
    expect(resultados.at(-1)!.retryAfterSec).toBeGreaterThan(0);
  });

  it("avisa del fallo de Redis, pero no una vez por petición", async () => {
    limitMock.mockRejectedValue(new Error("boom"));
    const errores = console.error as unknown as ReturnType<typeof vi.fn>;

    for (let i = 0; i < 5; i++) await checkRateLimit(`clave-d-${i}`, 10, 60_000);

    // Un aviso por minuto alcanza para enterarse; cinco por segundo solo tapan
    // el resto de los logs justo cuando hay que leerlos.
    expect(errores.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
