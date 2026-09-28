import { cookies } from "next/headers";
import { COOKIE, validSession, authConfigured } from "../lib/auth.mjs";
import Dashboard from "../components/Dashboard";
import Login from "../components/Login";
export const dynamic = "force-dynamic";
export default async function Home() {
  const session = (await cookies()).get(COOKIE)?.value;
  return validSession(session) ? (
    <Dashboard />
  ) : (
    <Login configured={authConfigured() && Boolean(process.env.DATABASE_URL)} />
  );
}
