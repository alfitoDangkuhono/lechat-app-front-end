import api from '../../../services/api'

const DATABASE_NAME = 'lechat-e2ee'
const DATABASE_VERSION = 1
const IDENTITY_STORE = 'identityKeys'
const TRUST_STORE = 'trustedPeerKeys'
const MESSAGE_STORE = 'encryptedMessages'
const IDENTITY_PROMISES = new Map()
const PUBLISHED_IDENTITY_PROMISES = new Map()
const IDENTITY_CONFLICTS = new Map()
const SESSION_KEYS = new Map()
const PEER_KEY_STATUS_CACHE = new Map()
const HKDF_SALT = new Uint8Array(32)
const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true })

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
