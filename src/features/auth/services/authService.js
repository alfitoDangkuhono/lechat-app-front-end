export const demoCredentials = {
  email: 'demo@lechat.app',
  password: 'lechat123',
}

export function authenticateDemo(email, password) {
  return email.trim().toLowerCase() === demoCredentials.email
    && password === demoCredentials.password
}
