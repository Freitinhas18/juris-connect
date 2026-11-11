import { useEffect, useState } from "react";
import { APP_NAME } from "@juris-connect/shared";

type Health = { status: string; app: string };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setError("API indisponível"));
  }, []);

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>{APP_NAME}</h1>
      {health && <p>API: {health.status}</p>}
      {error && <p>{error}</p>}
    </main>
  );
}