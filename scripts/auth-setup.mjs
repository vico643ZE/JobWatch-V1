import { randomBytes } from "node:crypto";
import { hashPassword } from "../lib/auth.mjs";
const password = randomBytes(18).toString("base64url");
console.log(
  "Conservez ce mot de passe dans votre gestionnaire :\n" +
    password +
    "\n\nVariables Render (ne pas commiter) :",
);
console.log("APP_PASSWORD_HASH=" + hashPassword(password));
console.log("SESSION_SECRET=" + randomBytes(48).toString("hex"));
