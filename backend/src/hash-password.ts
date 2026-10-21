// Prints the ADMIN_PASSWORD_HASH of a password:  npm run hash-password -w backend -- <password>
import { hashPassword } from './password.js'

const password = process.argv[2]
if (!password) {
  console.error('uso: npm run hash-password -w backend -- <contraseña>')
  process.exit(1)
}
console.log(await hashPassword(password))
