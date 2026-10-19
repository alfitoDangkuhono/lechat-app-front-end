import { passwordsMatch } from './passwordValidation'

export function validateRegistration({ name, email, password, confirmation, termsAccepted }) {
  if (!name.trim()) {
    return 'Nama lengkap wajib diisi.'
  }

  if (!email.trim()) {
    return 'Alamat email wajib diisi.'
  }

  if (password.length < 8) {
    return 'Kata sandi harus terdiri dari minimal 8 karakter.'
  }

  if (!passwordsMatch(password, confirmation)) {
    return 'Konfirmasi kata sandi belum sama.'
  }

  if (!termsAccepted) {
    return 'Persetujuan pendaftaran wajib dicentang.'
  }

  return ''
}

export function normalizeRegistrationData({ name, email, password, confirmation }) {
  return {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password,
    password_confirmation: confirmation,
  }
}
