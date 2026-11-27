import api from '../../../services/api'
import { getAuthToken } from '../../auth/services/authTokenService'

const DATABASE_NAME = 'lechat-e2ee'
const DATABASE_VERSION = 2
const IDENTITY_STORE = 'identityKeys'
const TRUST_STORE = 'trustedPeerKeys'
const MESSAGE_STORE = 'encryptedMessages'
const GROUP_KEY_STORE = 'groupKeys'
const IDENTITY_PROMISES = new Map()
const PUBLISHED_IDENTITY_PROMISES = new Map()
const IDENTITY_CONFLICTS = new Map()
const SESSION_KEYS = new Map()
const GROUP_KEYS = new Map()
const PEER_KEY_STATUS_CACHE = new Map()
const HKDF_SALT = new Uint8Array(32)
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })
const GROUP_KEY_UPLOAD_LIMIT = 10
const GROUP_KEY_UPLOAD_WINDOW_MS = 60_000
const GROUP_KEY_UPLOADS = []

function assertGroupKeyUploadRateLimit() {
  const now = Date.now()
  while (GROUP_KEY_UPLOADS.length && now - GROUP_KEY_UPLOADS[0] >= GROUP_KEY_UPLOAD_WINDOW_MS) {
    GROUP_KEY_UPLOADS.shift()
  }
  if (GROUP_KEY_UPLOADS.length >= GROUP_KEY_UPLOAD_LIMIT) {
    const retryIn = Math.max(1, Math.ceil(
      (GROUP_KEY_UPLOAD_WINDOW_MS - (now - GROUP_KEY_UPLOADS[0])) / 1000,
    ))
    throw new Error(`Terlalu banyak upload kunci grup. Tunggu ${retryIn} detik lalu coba lagi.`)
  }
}

function recordGroupKeyUpload() {
  GROUP_KEY_UPLOADS.push(Date.now())
}

function getCurrentUserIdFromToken() {
  const token = getAuthToken()
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64Payload = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(atob(base64Payload.padEnd(Math.ceil(base64Payload.length / 4) * 4, '=')))
    return decoded.sub ?? decoded.user_id ?? decoded.id ?? null
  } catch {
    return null
  }
}

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('Browser ini tidak mendukung penyimpanan kunci E2EE.'))
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(IDENTITY_STORE)) {
        database.createObjectStore(IDENTITY_STORE, { keyPath: 'username' })
      }
      if (!database.objectStoreNames.contains(TRUST_STORE)) {
        database.createObjectStore(TRUST_STORE, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(MESSAGE_STORE)) {
        database.createObjectStore(MESSAGE_STORE, { keyPath: 'key' })
      }
      if (!database.objectStoreNames.contains(GROUP_KEY_STORE)) {
        database.createObjectStore(GROUP_KEY_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Database E2EE gagal dibuka.'))
    request.onblocked = () => reject(new Error('Database E2EE sedang diblokir oleh tab lain.'))
  })
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Operasi database E2EE gagal.'))
  })
}

function transactionResult(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Transaksi database E2EE gagal.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaksi database E2EE dibatalkan.'))
  })
}

function toBase64(bytes) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function normalizeBase64(value) {
  const compact = value.replace(/\s+/g, '')
  const standard = compact.replace(/-/g, '+').replace(/_/g, '/')
  const remainder = standard.length % 4
  return remainder === 2 || remainder === 3
    ? standard + '='.repeat(4 - remainder)
    : standard
}

function fromBase64(value, label = 'data') {
  if (typeof value !== 'string' || !value) {
    throw new Error(`Data base64 E2EE tidak valid (${label}).`)
  }
  let binary
  try {
    binary = atob(normalizeBase64(value))
  } catch (error) {
    if (error instanceof DOMException) {
      throw new Error(`Data base64 E2EE tidak valid (${label}).`, { cause: error })
    }
    throw error
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function normalizeUsername(username) {
  if (typeof username !== 'string' || !username.trim()) {
    throw new Error('Username diperlukan untuk menggunakan E2EE.')
  }
  return username.trim()
}

function validatePublicKey(publicKey) {
  const raw = fromBase64(publicKey, 'public_key')
  if (raw.length !== 65 || raw[0] !== 4) {
    throw new Error('Public key lawan bicara bukan format P-256 uncompressed yang valid.')
  }
  return raw
}

async function getIdentity(username) {
  const account = normalizeUsername(username)
  if (IDENTITY_PROMISES.has(account)) return IDENTITY_PROMISES.get(account)

  const pending = (async () => {
    const database = await openDatabase()
    try {
      const readTransaction = database.transaction(IDENTITY_STORE, 'readonly')
      const saved = await requestResult(readTransaction.objectStore(IDENTITY_STORE).get(account))
      if (saved?.privateKey && saved?.publicKey) return saved

      const pair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        ['deriveBits'],
      )
      const publicKey = toBase64(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
      const record = {
        username: account,
        privateKey: pair.privateKey,
        publicKey: pair.publicKey,
        publicKeyBase64: publicKey,
        createdAt: Date.now(),
      }

      const transaction = database.transaction(IDENTITY_STORE, 'readwrite')
      const store = transaction.objectStore(IDENTITY_STORE)
      const existing = await requestResult(store.get(account))
      if (existing?.privateKey && existing?.publicKey) {
        await transactionResult(transaction)
        return existing
      }
      store.put(record)
      await transactionResult(transaction)
      return record
    } finally {
      database.close()
    }
  })()

  IDENTITY_PROMISES.set(account, pending)
  try {
    return await pending
  } catch (error) {
    IDENTITY_PROMISES.delete(account)
    throw error
  }
}

async function fetchServerPublicKey() {
  try {
    const response = await api.get('/profile')
    const profile = response.data?.data ?? response.data
    return typeof profile?.public_key === 'string' ? profile.public_key : null
  } catch {
    return undefined
  }
}

export async function ensureIdentityPublished(username) {
  const account = normalizeUsername(username)
  if (IDENTITY_CONFLICTS.has(account)) {
    throw IDENTITY_CONFLICTS.get(account)
  }
  if (PUBLISHED_IDENTITY_PROMISES.has(account)) {
    return PUBLISHED_IDENTITY_PROMISES.get(account)
  }

  const pending = getIdentity(account)
    .then(async (identity) => {
      const serverKey = await fetchServerPublicKey()
      if (serverKey === identity.publicKeyBase64) return identity
      if (serverKey === null || serverKey === undefined) {
        await api.put('/keys/me', { public_key: identity.publicKeyBase64 })
        return identity
      }
      const error = new Error(`Kunci akun ${account} terakhir diubah dari perangkat lain. Konfirmasi untuk menggunakan kunci perangkat ini.`)
      error.code = 'identity_conflict'
      error.serverKey = serverKey
      IDENTITY_CONFLICTS.set(account, error)
      throw error
    })
  PUBLISHED_IDENTITY_PROMISES.set(account, pending)
  try {
    return await pending
  } catch (error) {
    PUBLISHED_IDENTITY_PROMISES.delete(account)
    throw error
  }
}

export async function checkIdentityStatus(username) {
  const account = normalizeUsername(username)
  const identity = await getIdentity(account)
  const serverKey = await fetchServerPublicKey()
  if (serverKey === undefined) {
    return { username: account, profileAvailable: false }
  }
  if (serverKey === identity.publicKeyBase64) {
    return { username: account, profileAvailable: true, synced: true }
  }
  if (serverKey === null) {
    await api.put('/keys/me', { public_key: identity.publicKeyBase64 }).catch(() => {})
    return { username: account, profileAvailable: true, synced: true, uploaded: true }
  }
  return { username: account, profileAvailable: true, conflict: true, serverKey }
}

export async function publishIdentity(username) {
  const account = normalizeUsername(username)
  const identity = await getIdentity(account)
  await api.put('/keys/me', { public_key: identity.publicKeyBase64 })
  IDENTITY_CONFLICTS.delete(account)
  PUBLISHED_IDENTITY_PROMISES.delete(account)
}

function peerTrustKey(account, userId) {
  return `${account}|user:${userId}`
}

function normalizeUserId(userId) {
  const normalized = String(userId ?? '').trim()
  if (!/^\d+$/.test(normalized)) {
    throw new Error('ID pengguna lawan bicara diperlukan untuk memuat kunci E2EE.')
  }
  return normalized
}

async function getTrustedPeerKey(account, userId) {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(TRUST_STORE, 'readonly')
    return await requestResult(transaction.objectStore(TRUST_STORE).get(peerTrustKey(account, userId)))
  } finally {
    database.close()
  }
}

async function rememberPeerKey(account, userId, username, publicKey, updatedAt) {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(TRUST_STORE, 'readwrite')
    transaction.objectStore(TRUST_STORE).put({
      key: peerTrustKey(account, userId),
      account,
      userId,
      username,
      publicKey,
      updatedAt: updatedAt ?? null,
    })
    await transactionResult(transaction)
  } finally {
    database.close()
  }
}

export async function getPeerKeyStatus({ userId, username, account, ownPublicKey }) {
  const peer = normalizeUsername(username)
  const normalizedAccount = normalizeUsername(account)
  const normalizedUserId = normalizeUserId(userId)
  const cacheKey = `${normalizedAccount}|${normalizedUserId}|${ownPublicKey}`
  const cached = PEER_KEY_STATUS_CACHE.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  let data
  try {
    const response = await api.get(`/users/${normalizedUserId}/key`)
    data = response.data?.data ?? response.data
  } catch (error) {
    if (error?.response?.status === 404) {
      throw new Error(`${peer} belum mengunggah kunci E2EE. Minta mereka membuka aplikasi Lechat sekali untuk menyiapkan kunci.`, { cause: error })
    }
    throw error
  }
  const publicKey = data?.public_key
  validatePublicKey(publicKey)
  await crypto.subtle.importKey(
    'raw',
    fromBase64(publicKey, 'public_key'),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )

  const fingerprint = await getSafetyNumber(ownPublicKey, publicKey)
  const trusted = await getTrustedPeerKey(normalizedAccount, normalizedUserId)
  if (!trusted) {
    const value = {
      userId: normalizedUserId,
      username: peer,
      publicKey,
      fingerprint,
      changed: false,
      needsVerification: true,
      updatedAt: data?.updated_at ?? null,
    }
    PEER_KEY_STATUS_CACHE.set(cacheKey, { value, expiresAt: Date.now() + 30_000 })
    return value
  }

  const value = {
    userId: normalizedUserId,
    username: peer,
    publicKey,
    fingerprint,
    changed: trusted.publicKey !== publicKey,
    needsVerification: trusted.publicKey !== publicKey,
    trustedPublicKey: trusted.publicKey,
    updatedAt: data?.updated_at ?? null,
  }
  PEER_KEY_STATUS_CACHE.set(cacheKey, { value, expiresAt: Date.now() + 30_000 })
  return value
}

export async function trustPeerKey({ userId, username, account, publicKey, updatedAt }) {
  validatePublicKey(publicKey)
  const peer = normalizeUsername(username)
  const normalizedAccount = normalizeUsername(account)
  const normalizedUserId = normalizeUserId(userId)
  await rememberPeerKey(normalizedAccount, normalizedUserId, peer, publicKey, updatedAt)
  for (const key of PEER_KEY_STATUS_CACHE.keys()) {
    if (key.startsWith(`${normalizedAccount}|${normalizedUserId}|`)) PEER_KEY_STATUS_CACHE.delete(key)
  }
}

export async function getSafetyNumber(publicKeyA, publicKeyB) {
  const orderedKeys = [publicKeyA, publicKeyB].sort()
  const digest = new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`lechat-e2ee-v1|${orderedKeys[0]}|${orderedKeys[1]}`),
  ))
  return [...digest]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .match(/.{1,4}/g)
    .join(' ')
}

async function deriveSessionKey(ownIdentity, peerPublicKey) {
  const keyInfo = [ownIdentity.publicKeyBase64, peerPublicKey].sort()
  const cacheKey = `${keyInfo[0]}|${keyInfo[1]}`
  if (SESSION_KEYS.has(cacheKey)) return SESSION_KEYS.get(cacheKey)

  const peerKey = await crypto.subtle.importKey(
    'raw',
    validatePublicKey(peerPublicKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerKey },
    ownIdentity.privateKey,
    256,
  ))
  const hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey'])
  const sessionKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: HKDF_SALT,
      info: encoder.encode(`chat-e2ee-v1|${keyInfo[0]}|${keyInfo[1]}`),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  SESSION_KEYS.set(cacheKey, sessionKey)
  return sessionKey
}

export async function encryptDirectMessage({ text, from, to, toUserId }) {
  const sender = normalizeUsername(from)
  const recipient = normalizeUsername(to)
  const identity = await ensureIdentityPublished(sender)
  const peer = await getPeerKeyStatus({
    userId: toUserId,
    username: recipient,
    account: sender,
    ownPublicKey: identity.publicKeyBase64,
  })
  if (peer.needsVerification) {
    const error = new Error(peer.changed
      ? `Kunci ${recipient} berubah. Verifikasi safety number sebelum mengirim.`
      : `Verifikasi safety number ${recipient} sebelum mengirim.`)
    error.code = peer.changed ? 'peer_key_changed' : 'peer_key_unverified'
    error.peer = { username: recipient, ...peer }
    throw error
  }

  const key = await deriveSessionKey(identity, peer.publicKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: encoder.encode(`${sender}>${recipient}`),
      tagLength: 128,
    },
    key,
    encoder.encode(text),
  )
  return {
    encryption_version: 1,
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
  }
}

export async function decryptDirectMessage({ message, currentUsername, peerUserId, peerUsername }) {
  const recipient = normalizeUsername(currentUsername)
  const sender = message.from_username
  const to = message.to_username
  if (typeof sender !== 'string' || !sender || typeof to !== 'string' || !to) {
    throw new Error('Pesan terenkripsi tidak memiliki data pengirim/penerima yang valid.')
  }
  const isOwnMessage = sender === recipient
  if (!isOwnMessage && to !== recipient) {
    throw new Error('Pesan terenkripsi tidak melibatkan akun yang sedang masuk.')
  }
  if (Number(message.encryption_version) !== 1) {
    throw new Error('Versi enkripsi pesan tidak didukung.')
  }
  const identity = await ensureIdentityPublished(recipient)
  const peer = await getPeerKeyStatus({
    userId: isOwnMessage ? peerUserId : message.sender_id,
    username: isOwnMessage ? to : sender,
    account: recipient,
    ownPublicKey: identity.publicKeyBase64,
  })
  if (peer.needsVerification) {
    const error = new Error(peer.changed
      ? `Kunci ${sender} berubah. Verifikasi safety number untuk membaca pesan baru.`
      : `Verifikasi safety number ${sender} sebelum membaca pesan.`)
    error.code = peer.changed ? 'peer_key_changed' : 'peer_key_unverified'
    error.peer = { username: sender, ...peer }
    throw error
  }

  const key = await deriveSessionKey(identity, peer.publicKey)
  const iv = fromBase64(message.iv, 'iv')
  if (iv.length !== 12) {
    throw new Error(`IV pesan tidak valid (${iv.length} byte, seharusnya 12).`)
  }
  const ciphertext = fromBase64(message.ciphertext, 'ciphertext')
  if (ciphertext.length < 16 || ciphertext.length > 49_152) {
    throw new Error(`Panjang ciphertext pesan tidak valid (${ciphertext.length} byte).`)
  }
  const localPeer = typeof peerUsername === 'string' && peerUsername.trim()
    ? peerUsername.trim()
    : null
  const aadCandidates = [...new Set([
    `${sender}>${to}`,
    `${sender}>${recipient}`,
    `${recipient}>${to}`,
    ...(localPeer
      ? [isOwnMessage ? `${recipient}>${localPeer}` : `${localPeer}>${recipient}`]
      : []),
  ])]

  let plaintext = null
  let lastError = null
  for (const aad of aadCandidates) {
    try {
      plaintext = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: encoder.encode(aad),
          tagLength: 128,
        },
        key,
        ciphertext,
      )
      break
    } catch (error) {
      lastError = error
    }
  }
  if (plaintext === null) {
    const messageTime = Date.parse(message.created_at ?? '')
    const peerKeyTime = Date.parse(peer.updatedAt ?? '')
    const ownKeyTime = typeof identity.createdAt === 'number' ? identity.createdAt : NaN
    const predatesKeyChange = (
      Number.isFinite(messageTime) && Number.isFinite(peerKeyTime) && messageTime < peerKeyTime
    ) || (
      Number.isFinite(messageTime) && Number.isFinite(ownKeyTime) && messageTime < ownKeyTime
    )
    if (predatesKeyChange) {
      const error = new Error('Pesan ini dienkripsi untuk perangkat lain dan tidak dapat dibuka di sini.')
      error.code = 'key_mismatch'
      throw error
    }
    throw lastError ?? new Error('Pesan terenkripsi tidak dapat didekripsi.')
  }
  return decoder.decode(plaintext)
}

export async function saveEncryptedMessage(username, conversationId, message) {
  if (message.id === undefined || message.id === null) return
  const account = normalizeUsername(username)
  const database = await openDatabase()
  try {
    const transaction = database.transaction(MESSAGE_STORE, 'readwrite')
    transaction.objectStore(MESSAGE_STORE).put({
      key: `${account}:${conversationId}:${message.id}`,
      username: account,
      conversationId: String(conversationId),
      messageId: message.id,
      from_username: message.from_username,
      to_username: message.to_username,
      encryption_version: message.encryption_version,
      ciphertext: message.ciphertext,
      iv: message.iv,
      created_at: message.created_at ?? null,
    })
    await transactionResult(transaction)
  } finally {
    database.close()
  }
}

export async function debugDirectMessage({ message, currentUsername, peerUserId, peerUsername }) {
  const account = normalizeUsername(currentUsername)
  const report = { username: account, peerUserId: peerUserId ?? null, peerUsername: peerUsername ?? null }

  let identity = null
  try {
    identity = await getIdentity(account)
    report.ownPublicKey = `${identity.publicKeyBase64.slice(0, 24)}...`
  } catch (error) {
    report.ownPublicKey = `error: ${error.message}`
  }

  try {
    const response = await api.get('/profile')
    const profile = response.data?.data ?? response.data
    const serverKey = profile?.public_key
    report.serverOwnPublicKey = typeof serverKey === 'string' ? `${serverKey.slice(0, 24)}...` : serverKey ?? null
    report.keyPairMatchesServer = identity ? serverKey === identity.publicKeyBase64 : null
  } catch (error) {
    report.serverOwnPublicKey = `error: ${error.message}`
  }

  if (message) {
    const checkBase64 = (value) => {
      if (typeof value !== 'string' || !value) return 'kosong'
      try {
        fromBase64(value)
        return 'valid'
      } catch {
        return 'tidak valid'
      }
    }
    report.message = {
      from_username: message.from_username ?? null,
      to_username: message.to_username ?? null,
      sender_id: message.sender_id ?? null,
      created_at: message.created_at ?? null,
      senderIdEqualsPeerUserId: String(message.sender_id ?? '') === String(peerUserId ?? ''),
      fromIsMe: message.from_username === account,
      toIsMe: message.to_username === account,
      ivLength: typeof message.iv === 'string' ? message.iv.length : null,
      ivBase64: checkBase64(message.iv),
      ivSample: typeof message.iv === 'string' ? message.iv.slice(0, 24) : null,
      ivSampleCodes: typeof message.iv === 'string'
        ? [...message.iv.slice(0, 8)].map((character) => character.charCodeAt(0))
        : null,
      ciphertextLength: typeof message.ciphertext === 'string' ? message.ciphertext.length : null,
      ciphertextBase64: checkBase64(message.ciphertext),
    }
  } else {
    report.message = 'tidak ada pesan terenkripsi di state percakapan'
  }

  if (identity && peerUserId !== undefined && peerUserId !== null) {
    try {
      const peer = await getPeerKeyStatus({
        userId: peerUserId,
        username: peerUsername,
        account: account,
        ownPublicKey: identity.publicKeyBase64,
      })
      report.peerPublicKey = `${peer.publicKey.slice(0, 24)}...`
      report.peerVerified = !peer.needsVerification
      report.peerKeyChanged = peer.changed
    } catch (error) {
      report.peerPublicKey = `error: ${error.message}`
    }
  }

  if (message) {
    try {
      await decryptDirectMessage({ message, currentUsername, peerUserId, peerUsername })
      report.decrypt = 'berhasil'
    } catch (error) {
      report.decrypt = `gagal: ${error.message}`
    }
  }

  return report
}

export async function deleteEncryptedMessages(username, conversationId, messageIds) {
  const account = normalizeUsername(username)
  const conversation = String(conversationId ?? '')
  if (!conversation) return
  const ids = [...new Set((messageIds ?? []).map((id) => String(id ?? '')).filter(Boolean))]
  if (!ids.length) return

  const database = await openDatabase()
  try {
    const transaction = database.transaction(MESSAGE_STORE, 'readwrite')
    const store = transaction.objectStore(MESSAGE_STORE)
    for (const messageId of ids) {
      store.delete(`${account}:${conversation}:${messageId}`)
    }
    await transactionResult(transaction)
  } finally {
    database.close()
  }
}

async function fetchUserPublicKey(userId) {
  const normalizedId = normalizeUserId(userId)
  const response = await api.get(`/users/${normalizedId}/key`)
  const data = response.data?.data ?? response.data
  const publicKey = data?.public_key
  validatePublicKey(publicKey)
  return {
    userId: normalizedId,
    publicKey,
    updatedAt: data?.updated_at ?? null,
  }
}

async function saveGroupKeyRecord(account, conversationId, keyVersion, rawKeyBase64) {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(GROUP_KEY_STORE, 'readwrite')
    transaction.objectStore(GROUP_KEY_STORE).put({
      key: `${account}:${conversationId}:${keyVersion}`,
      username: account,
      conversationId: String(conversationId),
      keyVersion: Number(keyVersion),
      rawKey: rawKeyBase64,
      createdAt: new Date().toISOString(),
    })
    await transactionResult(transaction)
  } finally {
    database.close()
  }
}

async function getGroupKeyRecord(account, conversationId, keyVersion) {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(GROUP_KEY_STORE, 'readonly')
    const request = transaction.objectStore(GROUP_KEY_STORE).get(`${account}:${conversationId}:${keyVersion}`)
    return await requestResult(request)
  } finally {
    database.close()
  }
}

async function listGroupKeyVersions(account, conversationId) {
  const database = await openDatabase()
  try {
    const transaction = database.transaction(GROUP_KEY_STORE, 'readonly')
    const store = transaction.objectStore(GROUP_KEY_STORE)
    const prefix = `${account}:${conversationId}:`
    const versions = []
    const request = store.openCursor()
    await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          if (String(cursor.key).startsWith(prefix)) {
            versions.push(Number(cursor.value.keyVersion))
          }
          cursor.continue()
        } else {
          resolve()
        }
      }
      request.onerror = () => reject(request.error ?? new Error('Gagal membaca versi kunci grup.'))
    })
    await transactionResult(transaction)
    return versions.filter((value) => Number.isFinite(value))
  } finally {
    database.close()
  }
}

export async function clearGroupKeyCache(username, conversationId) {
  const account = normalizeUsername(username)
  const convId = String(conversationId ?? '')
  if (!convId) return

  const prefix = `${account}:${convId}:`
  for (const key of [...GROUP_KEYS.keys()]) {
    if (key.startsWith(prefix)) GROUP_KEYS.delete(key)
  }

  const database = await openDatabase()
  try {
    const transaction = database.transaction(GROUP_KEY_STORE, 'readwrite')
    const store = transaction.objectStore(GROUP_KEY_STORE)
    const request = store.openCursor()
    await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          if (String(cursor.key).startsWith(prefix)) {
            cursor.delete()
          }
          cursor.continue()
        } else {
          resolve()
        }
      }
      request.onerror = () => reject(request.error ?? new Error('Gagal menghapus cache kunci grup.'))
    })
    await transactionResult(transaction)
  } finally {
    database.close()
  }
}

async function wrapGroupKey({ ownIdentity, recipientPublicKey, rawKeyBytes, conversationId, keyVersion, recipientUserId }) {
  // Backend (Go) menuntut user_id sebagai JSON number, bukan string.
  const numericUserId = Number(recipientUserId)
  const sessionKey = await deriveSessionKey(ownIdentity, recipientPublicKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aad = encoder.encode(`group-key:${conversationId}:${keyVersion}:${numericUserId}`)
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad,
      tagLength: 128,
    },
    sessionKey,
    rawKeyBytes,
  )
  return {
    user_id: numericUserId,
    encrypted_key: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
  }
}

async function unwrapGroupKey({ ownIdentity, senderPublicKey, encryptedKeyBase64, ivBase64, conversationId, keyVersion, myUserId }) {
  const sessionKey = await deriveSessionKey(ownIdentity, senderPublicKey)
  const iv = fromBase64(ivBase64, 'group_key_iv')
  if (iv.length !== 12) {
    throw new Error(`IV kunci grup tidak valid (${iv.length} byte, seharusnya 12).`)
  }
  const ciphertext = fromBase64(encryptedKeyBase64, 'encrypted_group_key')
  if (ciphertext.length !== 48) {
    throw new Error(`Encrypted group key tidak valid (${ciphertext.length} byte, seharusnya 48).`)
  }
  try {
    const rawKeyBytes = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: encoder.encode(`group-key:${conversationId}:${keyVersion}:${myUserId}`),
        tagLength: 128,
      },
      sessionKey,
      ciphertext,
    )
    return new Uint8Array(rawKeyBytes)
  } catch (error) {
    // Fallback: AAD tanpa user id jika dikirim dengan format envelope umum
    try {
      const rawFallback = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: encoder.encode(`group-key:${conversationId}:${keyVersion}`),
          tagLength: 128,
        },
        sessionKey,
        ciphertext,
      )
      return new Uint8Array(rawFallback)
    } catch {
      throw error
    }
  }
}

async function fetchAndCacheGroupKey({ account, convId, version }) {
  const query = version ? `?key_version=${encodeURIComponent(String(version))}` : ''
  const response = await api.get(
    `/conversations/${encodeURIComponent(convId)}/keys/me${query}`,
  )
  const data = response.data?.data ?? response.data
  if (!data?.encrypted_key || !data?.iv) {
    return null
  }
  const resolvedVersion = Number(data.key_version ?? version) || 1
  const cacheKey = `${account}:${convId}:${resolvedVersion}`
  if (GROUP_KEYS.has(cacheKey)) return GROUP_KEYS.get(cacheKey)

  const identity = await ensureIdentityPublished(account)
  const senderId = data.sender_id ?? data.sender_user_id
  if (!senderId) {
    throw new Error('Respons kunci grup tidak memiliki ID pengirim yang valid.')
  }

  const senderKeyInfo = await fetchUserPublicKey(senderId)
  const myUserId = getCurrentUserIdFromToken()

  const rawBytes = await unwrapGroupKey({
    ownIdentity: identity,
    senderPublicKey: senderKeyInfo.publicKey,
    encryptedKeyBase64: data.encrypted_key,
    ivBase64: data.iv,
    conversationId: convId,
    keyVersion: resolvedVersion,
    myUserId: myUserId ?? '',
  })

  const rawBase64 = toBase64(rawBytes)
  await saveGroupKeyRecord(account, convId, resolvedVersion, rawBase64)

  const key = await crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  GROUP_KEYS.set(cacheKey, key)
  return key
}

export async function getOrFetchGroupKey({ conversationId, keyVersion = 1, currentUsername }) {
  const account = normalizeUsername(currentUsername)
  const convId = String(conversationId)
  const version = Number(keyVersion) || 1
  const cacheKey = `${account}:${convId}:${version}`

  if (GROUP_KEYS.has(cacheKey)) {
    return GROUP_KEYS.get(cacheKey)
  }

  const stored = await getGroupKeyRecord(account, convId, version)
  if (stored?.rawKey) {
    const rawBytes = fromBase64(stored.rawKey, 'stored_group_key')
    const key = await crypto.subtle.importKey(
      'raw',
      rawBytes,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
    GROUP_KEYS.set(cacheKey, key)
    return key
  }

  try {
    return await fetchAndCacheGroupKey({ account, convId, version })
  } catch (error) {
    if (error?.response?.status === 404) {
      // Kontrak §5.3/§8: gagal mengambil kunci untuk user ini → bersihkan cache
      // (bisa berarti kita sedang dikeluarkan atau belum di-wrap pada versi itu).
      await clearGroupKeyCache(account, convId)
      return null
    }
    if (error?.response?.status === 403) {
      // Kontrak §5.3: bukan anggota percakapan lagi.
      await clearGroupKeyCache(account, convId)
    }
    throw error
  }
}

async function publishGroupKeyPayload(convId, keyVersion, wrappedKeys) {
  assertGroupKeyUploadRateLimit()
  const response = await api.post(`/conversations/${encodeURIComponent(convId)}/keys`, {
    key_version: keyVersion,
    keys: wrappedKeys,
  })
  recordGroupKeyUpload()
  return response
}

export async function createAndPublishGroupKey({ conversationId, keyVersion = 1, currentUsername, members = [] }) {
  const account = normalizeUsername(currentUsername)
  const convId = String(conversationId)
  const version = Number(keyVersion) || 1
  const cacheKey = `${account}:${convId}:${version}`

  const identity = await ensureIdentityPublished(account)
  const myUserId = getCurrentUserIdFromToken()

  // Generate 256-bit AES-GCM raw key (32 bytes)
  const rawKeyBytes = crypto.getRandomValues(new Uint8Array(32))

  const targetMemberIds = new Set()
  if (myUserId !== null && myUserId !== undefined) {
    targetMemberIds.add(String(myUserId))
  }
  for (const member of members) {
    const id = member.user_id ?? member.userId ?? member.id
    if (id !== undefined && id !== null) {
      targetMemberIds.add(String(id))
    }
  }

  const wrappedKeys = []
  for (const rawMemberId of targetMemberIds) {
    const memberId = normalizeUserId(rawMemberId)
    try {
      let memberPublicKey = null
      if (myUserId !== null && String(memberId) === String(myUserId)) {
        memberPublicKey = identity.publicKeyBase64
      } else {
        const info = await fetchUserPublicKey(memberId)
        memberPublicKey = info.publicKey
      }

      if (memberPublicKey) {
        const wrapped = await wrapGroupKey({
          ownIdentity: identity,
          recipientPublicKey: memberPublicKey,
          rawKeyBytes,
          conversationId: convId,
          keyVersion: version,
          recipientUserId: memberId,
        })
        wrappedKeys.push(wrapped)
      }
    } catch (error) {
      console.warn(`Gagal membungkus kunci grup untuk pengguna ${memberId}:`, error.message)
    }
  }

  if (wrappedKeys.length === 0) {
    throw new Error('Tidak ada anggota grup yang memiliki kunci E2EE yang valid.')
  }

  await publishGroupKeyPayload(convId, version, wrappedKeys)

  const rawBase64 = toBase64(rawKeyBytes)
  await saveGroupKeyRecord(account, convId, version, rawBase64)

  const key = await crypto.subtle.importKey(
    'raw',
    rawKeyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
  GROUP_KEYS.set(cacheKey, key)
  return key
}

export async function rewrapGroupKeyForMember({ conversationId, currentUsername, newUserId }) {
  const account = normalizeUsername(currentUsername)
  const convId = String(conversationId)
  const memberId = normalizeUserId(newUserId)

  // Ambil key_version tertinggi yang sudah tersimpan lokal untuk percakapan ini.
  const versions = await listGroupKeyVersions(account, convId)
  if (!versions.length) return null
  const highestVersion = Math.max(...versions)

  const record = await getGroupKeyRecord(account, convId, highestVersion)
  if (!record?.rawKey) return null

  const identity = await ensureIdentityPublished(account)
  const rawKeyBytes = fromBase64(record.rawKey, 'stored_group_key')

  let recipientPublicKey
  try {
    const info = await fetchUserPublicKey(memberId)
    recipientPublicKey = info.publicKey
  } catch (error) {
    console.warn(
      `Tidak dapat mengambil kunci E2EE pengguna ${memberId} untuk re-wrap pada ${convId}:`,
      error?.message ?? error,
    )
    return null
  }

  const wrapped = await wrapGroupKey({
    ownIdentity: identity,
    recipientPublicKey,
    rawKeyBytes,
    conversationId: convId,
    keyVersion: highestVersion,
    recipientUserId: memberId,
  })

  await publishGroupKeyPayload(convId, highestVersion, [wrapped])
  return { key_version: highestVersion, user_id: Number(memberId) }
}

export async function encryptGroupMessage({ text, conversationId, keyVersion = 1, fromUsername }) {
  const account = normalizeUsername(fromUsername)
  const convId = String(conversationId)
  const version = Number(keyVersion) || 1

  let groupKey = await getOrFetchGroupKey({
    conversationId: convId,
    keyVersion: version,
    currentUsername: account,
  })

  if (!groupKey) {
    // Kontrak §4.1/§5.2: jangan menimpa versi aktif dengan kunci acak baru saat
    // kunci belum dibungkus untuk kita. Coba ambil versi tertinggi untuk akun ini dulu.
    groupKey = await fetchAndCacheGroupKey({ account, convId, version: undefined })
      .catch(async (error) => {
        if (error?.response?.status === 404 || error?.response?.status === 403) {
          await clearGroupKeyCache(account, convId)
          return null
        }
        throw error
      })
  }

  if (!groupKey) {
    const error = new Error(
      'Kunci grup belum tersedia untuk akun Anda di percakapan ini. Minta anggota aktif untuk membungkus ulang kunci grup untuk Anda, lalu coba kirim lagi.',
    )
    error.code = 'group_key_unavailable'
    throw error
  }

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aad = encoder.encode(`group:${convId}:${account}`)
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad,
      tagLength: 128,
    },
    groupKey,
    encoder.encode(text),
  )

  return {
    encryption_version: 1,
    key_version: version,
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    iv: toBase64(iv),
  }
}

export async function decryptGroupMessage({ message, conversationId, currentUsername }) {
  const account = normalizeUsername(currentUsername)
  const convId = String(conversationId)
  const version = Number(message.key_version) || 1

  const groupKey = await getOrFetchGroupKey({
    conversationId: convId,
    keyVersion: version,
    currentUsername: account,
  })

  if (!groupKey) {
    throw new Error(`Kunci grup (versi ${version}) belum tersedia di perangkat ini.`)
  }

  const iv = fromBase64(message.iv, 'group_iv')
  if (iv.length !== 12) {
    throw new Error(`IV pesan grup tidak valid (${iv.length} byte, seharusnya 12).`)
  }
  const ciphertext = fromBase64(message.ciphertext, 'group_ciphertext')
  const sender = message.from_username || message.author || ''

  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: encoder.encode(`group:${convId}:${sender}`),
        tagLength: 128,
      },
      groupKey,
      ciphertext,
    )
    return decoder.decode(plaintext)
  } catch (error) {
    try {
      const plaintextFallback = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
          additionalData: encoder.encode(`group:${convId}`),
          tagLength: 128,
        },
        groupKey,
        ciphertext,
      )
      return decoder.decode(plaintextFallback)
    } catch {
      throw error
    }
  }
}
