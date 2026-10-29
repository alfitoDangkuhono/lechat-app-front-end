import { passwordsMatch } from './passwordValidation'

export function validateRegistration({ name, email, handphone, password, confirmation, termsAccepted }) {
  if (!name.trim()) {
    return 'Nama lengkap wajib diisi.'
  }

  if (!email.trim()) {
    return 'Alamat email wajib diisi.'
  }

  if (!handphone.trim()) {
    return 'Nomor handphone wajib diisi.'
  }

  if (!/^[0-9]+$/.test(handphone)) {
    return 'Nomor handphone hanya boleh berisi angka.'
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

export function normalizeRegistrationData({ name, email, handphone, password, confirmation }) {
  return {
    username: name.trim(),
    email: email.trim().toLowerCase(),
    phone: handphone.trim(),
    password,
    password_confirmation: confirmation,
  }
}
