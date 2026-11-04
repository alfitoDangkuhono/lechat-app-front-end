# Panduan Integrasi Frontend React

Panduan ini menjelaskan integrasi aplikasi React dengan backend Lechat melalui REST API dan WebSocket. API lengkap dan payload endpoint tersedia di [API.md](./API.md).

## 1. Prasyarat dan konfigurasi backend

Pastikan PostgreSQL aktif dan semua migrasi backend telah dijalankan. Jalankan backend, lalu pastikan health check merespons:

```text
GET http://localhost:8989/health
```

Tambahkan origin frontend ke konfigurasi backend. Origin harus cocok persis (termasuk scheme dan port):

```env
CORS_ALLOW_ORIGINS=http://localhost:5173
CORS_ALLOW_METHODS=GET,POST,PUT,PATCH,DELETE,OPTIONS
CORS_ALLOW_HEADERS=Origin,Content-Type,Accept,Authorization
```

`PATCH` perlu diizinkan untuk edit pesan. Nilai origin yang sama juga digunakan untuk pemeriksaan `Origin` saat handshake WebSocket. Restart backend setelah mengubah konfigurasi.

## 2. Buat proyek React dan URL backend

Contoh berikut memakai Vite:

```powershell
npm create vite@latest lechat-web -- --template react
cd lechat-web
npm install
npm run dev
```

Buat `.env.local` di root frontend:

```env
VITE_API_BASE_URL=http://localhost:8989/api/v1
VITE_WS_URL=ws://localhost:8989/api/v1/ws
```

Untuk production, gunakan URL HTTPS dan WSS:

```env
VITE_API_BASE_URL=https://api.example.com/api/v1
VITE_WS_URL=wss://api.example.com/api/v1/ws
```

Variabel `VITE_*` tersedia di bundle browser. Jangan pernah menaruh JWT signing secret, password database, atau credential server di sana.

## 3. Kontrak API yang perlu diketahui

### Format response

REST success menggunakan envelope:

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

REST error juga memakai `code`, `message`, dan kadang `data`. Periksa HTTP status maupun `message`, jangan hanya mengandalkan status `200`.

### Authentication

- Register: `POST /registers`.
- Login: `POST /sessions`.
- Keduanya mengembalikan `data.token` (access token) dan `data.refresh_token`.
- Endpoint terproteksi memakai header `Authorization` dengan nilai `Bearer <access-token>`.
- Refresh: `POST /sessions/refresh`, memakai **refresh token** pada header yang sama. Refresh berhasil mengembalikan pasangan token baru dan mencabut refresh token lama; simpan pasangan baru secara atomik.
- Logout: `DELETE /sessions` dengan access token. Backend mencabut access token saat ini, tetapi logout tidak mencabut refresh token. Frontend tetap harus menghapus kedua token secara lokal.
- Response login tidak berisi `expires_in`. Token berlaku sesuai konfigurasi backend; contoh konfigurasi backend saat ini menetapkan `EXPIRE_TOKEN=40` detik secara default. Pastikan konfigurasi untuk environment aplikasi sesuai dan refresh sebelum access token habis.

Token diberikan sebagai JSON, bukan cookie `HttpOnly`. Untuk contoh sederhana di bawah, token disimpan di memory React. Penyimpanan persisten seperti `localStorage` membuat token dapat dibaca JavaScript dan meningkatkan dampak XSS; evaluasi risiko sebelum menggunakannya. Backend saat ini belum menyediakan autentikasi cookie `HttpOnly`.

## 4. Client REST sederhana

Contoh `src/lib/api.js`:

```js
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function apiRequest(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload?.data;
}

export async function login(email, password) {
  return apiRequest("/sessions", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function refreshSession(refreshToken) {
  return apiRequest("/sessions/refresh", {
    method: "POST",
    token: refreshToken,
  });
}

export async function logout(accessToken) {
  return apiRequest("/sessions", {
    method: "DELETE",
    token: accessToken,
  });
}
```

`apiRequest` mengembalikan `data`, bukan seluruh envelope. Jika UI memerlukan `code` atau `message`, ubah helper agar mengembalikan keseluruhan payload.

Login call:

```js
const tokens = await login(email, password);
setSession({
  accessToken: tokens.token,
  refreshToken: tokens.refresh_token,
});
```

React state di memory hilang saat reload. Jika aplikasi perlu memulihkan sesi setelah reload, tentukan strategi penyimpanan token yang sesuai dengan threat model aplikasi. Jangan mencatat token ke console, analytics, URL, atau error reporting.

### Refresh dan request bersamaan

Refresh token bersifat sekali pakai: request refresh yang berhasil mencabut token sebelumnya. Karena itu:

1. Hindari mengirim beberapa request refresh sekaligus.
2. Serialisasikan refresh dengan satu promise bersama (single-flight) di session provider.
3. Ganti access dan refresh token lama hanya setelah menerima pasangan baru yang valid.
4. Jika refresh mengembalikan `401`, hapus session lokal dan arahkan pengguna untuk login lagi.
5. Untuk `401` dari API, lakukan paling banyak satu refresh lalu retry request sekali. Jangan mengulang tanpa batas.

Contoh fungsi refresh langsung:

```js
async function rotateSession(session, setSession) {
  const tokens = await refreshSession(session.refreshToken);
  const nextSession = {
    accessToken: tokens.token,
    refreshToken: tokens.refresh_token,
  };
  setSession(nextSession);
  return nextSession;
}
```

Jalankan fungsi ini melalui satu pengelola session bersama; jangan memanggilnya secara independen dari setiap komponen. Backend juga menyediakan `GET /sessions/check-session`, yang mengembalikan expiry session (`data.expires_at`) untuk token access yang sedang dikirim.

## 5. Integrasi REST dasar

### Ambil profil pengguna saat ini

Endpoint ini memerlukan access token dan mengembalikan profil akun yang sedang login:

```js
const profile = await apiRequest("/profile", {
  token: session.accessToken,
});
```

`apiRequest` mengembalikan nilai `data` dari envelope response. Gunakan field yang disediakan backend untuk menampilkan profil; jangan mengisi nilai contoh jika field tidak tersedia.

### Ambil daftar percakapan

```js
const conversations = await apiRequest("/conversations", {
  token: session.accessToken,
});
```

Setiap item dapat memuat `id`, `type`, `title`, `members`, pesan terakhir, dan `unread_message_count`.

### Membuka percakapan pribadi dari kontak

UI membuka percakapan pribadi dengan memilih kontak yang sudah diterima dari panel Kontak. Frontend mencari direct conversation yang sudah ada; jika belum ada, frontend membuatnya melalui `POST /conversations`. Karena itu, endpoint direct tetap diperlukan meskipun dialog **Percakapan baru** sekarang khusus untuk membuat grup.

```js
const conversation = await apiRequest("/conversations", {
  method: "POST",
  token: session.accessToken,
  body: JSON.stringify({
    type: "direct",
    member_ids: [friendUserId],
  }),
});
// conversation.id
```

`member_ids` berisi satu ID kontak selain ID pengguna yang sedang login. Backend harus memastikan kontak tersebut berstatus accepted. Jika direct conversation untuk pasangan itu sudah ada, kembalikan conversation yang sudah ada alih-alih membuat duplikat.

### Membuat grup dari daftar kontak

Dialog **Buat grup baru** memuat kontak melalui `GET /contacts`, lalu menampilkan pencarian dan pemilihan beberapa kontak. Daftar ini harus berisi kontak accepted milik pengguna yang sedang login; permintaan kontak yang masih pending tidak dapat dipilih. Dialog mengirim ID pengguna terpilih, bukan nama atau objek kontak. Nama grup bersifat opsional.

```http
GET /api/v1/contacts
Authorization: Bearer <access-token>
```

```json
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "user_id": 24,
      "name": "Nadia Putri",
      "username": "nadia"
    },
    {
      "user_id": 31,
      "name": "Raka Pratama",
      "username": "raka"
    }
  ]
}
```

Frontend juga dapat membaca daftar kontak dalam `data.items` atau `data.contacts`. Setiap item harus memiliki identifier `user_id` atau `id`; nama tampilan dapat diberikan melalui `name`, `full_name`, atau `username`.

Saat pengguna mengonfirmasi grup, frontend mengirim:

```http
POST /api/v1/conversations
Authorization: Bearer <access-token>
Content-Type: application/json
```

```json
{
  "type": "group",
  "member_ids": [24, 31],
  "title": "Tim Produk"
}
```

`title` boleh tidak dikirim atau kosong; backend kemudian dapat menentukan nama grup default. `member_ids` berisi satu atau lebih kontak terpilih dan tidak menyertakan pengguna yang sedang login—backend harus menambahkan pembuat sebagai anggota grup. Tolak daftar kosong dan validasi setiap ID di server: semua anggota yang diminta harus merupakan kontak accepted milik pembuat. Jangan mengandalkan daftar kontak atau validasi frontend sebagai kontrol otorisasi.

Frontend mengharapkan response sukses menggunakan envelope standar dan objek conversation di `data.conversation` atau langsung di `data`. Objek conversation wajib memiliki `id`; sertakan `type: "group"`, `title`/nama tampilan, serta `members` atau `member_count` agar daftar percakapan dan header grup dapat menampilkan informasi yang benar. Field `data.created` bersifat opsional; jika ada, nilainya menandakan apakah grup baru dibuat. Contoh:

```json
{
  "code": 201,
  "message": "success",
  "data": {
    "created": true,
    "conversation": {
      "id": 82,
      "type": "group",
      "title": "Tim Produk",
      "member_count": 3
    }
  }
}
```

Jika pengguna belum memiliki kontak accepted, frontend menampilkan keadaan kosong dengan tautan ke panel Kontak. Permintaan tambah kontak tetap dilakukan melalui `POST /contacts/requests`; hanya setelah diterima kontak tersebut akan muncul sebagai pilihan anggota grup.

### Ambil history dan pagination

```js
const query = new URLSearchParams({ limit: "50" });
const page = await apiRequest(
  `/conversations/${conversationId}/messages?${query}`,
  { token: session.accessToken },
);

setMessages(page.items);
setNextBeforeId(page.next_before_id);
```

Untuk mengambil pesan yang lebih lama, kirim `before_id` dari response sebelumnya:

```js
const query = new URLSearchParams({
  limit: "50",
  before_id: nextBeforeId,
});
const olderPage = await apiRequest(
  `/conversations/${conversationId}/messages?${query}`,
  { token: session.accessToken },
);
setMessages((current) => [...current, ...olderPage.items]);
setNextBeforeId(olderPage.next_before_id);
```

`limit` harus antara 1 dan 100. API mengembalikan pesan terbaru dahulu. Batasi permintaan agar tidak mengulang cursor yang sama; jika `next_before_id` kosong, tidak ada halaman lanjutan yang ditunjukkan.

## 6. WebSocket di browser React

API `WebSocket` browser tidak menyediakan opsi untuk menambahkan header `Authorization` custom. Gunakan frame `auth` sebagai frame pertama setelah `onopen`. Jangan menaruh token di URL/query string.

### Urutan koneksi

1. Buka `ws://.../api/v1/ws` atau `wss://.../api/v1/ws`.
2. Pada `open`, kirim `{"type":"auth","token":"<access-token>"}`.
3. Tunggu event `auth.ok`.
4. Jika ada room yang sedang dibuka, kirim `conversation.join` untuk percakapan tersebut.
5. Tunggu `conversation.history`; `data.joined` bernilai `true` untuk join.
6. Koneksi terautentikasi juga dapat tetap terbuka tanpa join room agar menerima notifikasi pesan untuk room lain saat pengguna online.
7. Tangani event real-time dan tutup koneksi ketika komponen/session dibersihkan.

Sebelum frame `auth.ok`, server menunggu frame auth pertama selama paling lama 8 detik. Event WebSocket memakai bentuk `{ "type": "...", "conversation_id": "...", "data": ..., "error": "..." }`. Tidak ada `request_id` untuk mencocokkan error dengan frame tertentu.

Backend mengirim `message.created` ke semua koneksi WebSocket aktif milik anggota aktif pada conversation tersebut, termasuk koneksi yang tidak sedang join ke conversation. Event harus menyertakan `conversation_id` serta payload pesan agar frontend dapat memperbarui preview, menaikkan unread untuk room yang tidak sedang dibaca, dan menampilkan toast. Broadcast hanya menjangkau pengguna yang online; notifikasi browser/OS atau push saat offline memerlukan dukungan terpisah. Untuk event room yang tidak sedang di-join, klien tidak boleh mengirim receipt melalui koneksi room aktif.

### Contoh hook WebSocket

Contoh berikut menangani auth, join, cleanup, dan reconnect dengan backoff. `getAccessToken` harus membaca token terbaru dari pengelola session; bila token sudah expired, pengelola session sebaiknya menyelesaikan refresh sebelum mengembalikan token.

```jsx
import { useEffect, useRef, useState } from "react";

const WS_URL = import.meta.env.VITE_WS_URL;

export function useChatSocket({
  conversationId,
  getAccessToken,
  onEvent,
}) {
  const socketRef = useRef(null);
  const onEventRef = useRef(onEvent);
  const [status, setStatus] = useState("disconnected");

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!conversationId || !getAccessToken) return undefined;

    let disposed = false;
    let socket;
    let retryTimer;
    let retryCount = 0;

    const connect = async () => {
      let accessToken;
      try {
        accessToken = await getAccessToken();
      } catch {
        if (!disposed) setStatus("auth-error");
        return;
      }
      if (disposed || !accessToken) {
        if (!disposed) setStatus("auth-error");
        return;
      }

      socket = new WebSocket(WS_URL);
      socketRef.current = socket;
      setStatus("connecting");

      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "auth", token: accessToken }));
      };

      socket.onmessage = (message) => {
        let event;
        try {
          event = JSON.parse(message.data);
        } catch {
          return;
        }

        if (event.type === "auth.ok") {
          retryCount = 0;
          setStatus("connected");
          socket.send(JSON.stringify({
            type: "conversation.join",
            conversation_id: conversationId,
            limit: 50,
          }));
        }

        onEventRef.current?.(event);
      };

      socket.onerror = () => {
        setStatus("error");
      };

      socket.onclose = () => {
        if (disposed) return;
        setStatus("disconnected");
        const delay = Math.min(1000 * (2 ** retryCount), 15000);
        retryCount += 1;
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
      setStatus("disconnected");
    };
  }, [conversationId, getAccessToken]);

  const send = (frame) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify(frame));
    return true;
  };

  return { status, send };
}
```

Karena `getAccessToken` menjadi dependency effect, pertahankan referensi fungsinya dengan `useCallback` atau definisikan pada session manager di luar komponen. Fungsi baru pada setiap render akan membuat effect menutup socket dan membuat koneksi lagi.

Contoh pemakaian dan penanganan event:

```jsx
const { status, send } = useChatSocket({
  conversationId,
  getAccessToken,
  onEvent(event) {
    if (event.type === "conversation.history") {
      setMessages(event.data.items);
      setNextBeforeId(event.data.next_before_id);
    } else if (event.type === "message.created") {
      setMessages((current) => mergeMessage(current, event.data));
    } else if (event.type === "message.updated" ||
               event.type === "message.deleted") {
      setMessages((current) => mergeMessage(current, event.data));
    } else if (event.type === "error") {
      setChatError(event.error);
    }
  },
});
```

Fungsi deduplikasi sederhana:

```js
function mergeMessage(current, incoming) {
  const index = current.findIndex((message) =>
    message.id === incoming.id ||
    message.client_message_id === incoming.client_message_id
  );
  if (index < 0) return [...current, incoming];
  return current.map((message, i) => i === index ? incoming : message);
}
```

Sesuaikan strategi pengurutan pesan dengan UI: history dikirim terbaru dahulu, sedangkan event baru datang setelahnya. Saat berpindah conversation, hook menutup socket lama dan membuka koneksi baru; jika ingin mempertahankan satu koneksi, buat pengelolaan room dan listener sebagai satu service tingkat aplikasi.

### Mengirim pesan

`message.send` wajib dikirim setelah `conversation.join` berhasil dilakukan. Server menyimpan pesan dan broadcast `message.created` ke subscriber aktif, termasuk pengirim yang masih join. Buat UUID baru per pesan; jika retry akibat koneksi tidak pasti, gunakan UUID **yang sama** supaya backend dapat mencegah duplikasi.

```js
function sendText(send, conversationId, body) {
  const text = body.trim();
  if (!text) return false;

  return send({
    type: "message.send",
    conversation_id: conversationId,
    client_message_id: crypto.randomUUID(),
    message_type: "text",
    body: text,
  });
}
```

Untuk mempertahankan idempotency saat retry, simpan frame pending (terutama `client_message_id`) sampai server mengirim `message.created` yang cocok atau history mengonfirmasi pesan tersimpan. Jangan membuat UUID baru untuk retry pesan yang sama.

Backend saat ini hanya mendukung pesan teks non-kosong. Walaupun beberapa enum request memuat tipe media, upload dan pengiriman media belum tersedia.

### History dan pagination melalui WebSocket

`conversation.join` bergabung sekaligus mengambil history. Untuk mengambil halaman lama setelah join, kirim:

```js
send({
  type: "conversation.history",
  conversation_id: conversationId,
  limit: 50,
  before_id: nextBeforeId,
});
```

Event `conversation.history` berisi `data.items`, `data.next_before_id`, dan `data.joined`. `conversation.history` frame tidak membuat koneksi join room.

## 7. Receipts, contacts, dan groups

### Delivered/read

Setelah klien menerima pesan, kirim `receipt.delivered` dengan `conversation_id` dan `through_message_id`. Setelah pesan benar-benar ditampilkan/dibaca menurut kebijakan UI, kirim `receipt.read` dengan field yang sama. Melalui REST, endpoint yang sesuai adalah `/conversations/{id}/delivered` dan `/read`.

Kedua cara menandai pesan sampai cursor, bukan satu pesan saja. Jangan mengirim receipt untuk pesan yang dikirim pengguna sendiri; backend mencatat receipt untuk pesan dari pengguna lain.

**Status receipt yang dipakai frontend:**

1. Setelah menerima `receipt.read`, backend mengirim event WebSocket kepada pengirim pesan yang tercakup dalam cursor:

   ```json
   {
     "type": "receipt.read",
     "conversation_id": 12,
     "data": { "through_message_id": "message-uuid" }
   }
   ```

2. History menyertakan `receipt_status` untuk pesan keluar dengan nilai `sent`, `delivered`, atau `read`, sehingga status tetap benar setelah halaman dimuat ulang.

Frontend menampilkan satu centang untuk `sent`, centang ganda abu-abu untuk `delivered`, dan centang ganda biru untuk `read`. Event `receipt.read` memperbarui pesan keluar sampai `through_message_id` secara realtime.

### Contacts

- `GET /contacts` mengambil kontak accepted.
- `GET /contacts/requests` mengambil request pending; `direction` bernilai `incoming` atau `outgoing`.
- `POST /contacts/requests` mengirim permintaan dengan body `{"phone":"081234567890"}`. Nomor dicocokkan persis; nomor tidak ditemukan menghasilkan `404`, sedangkan nomor ambigu menghasilkan `409`.
- `POST /contacts/{user_id}/accept` menerima request.
- `DELETE /contacts/{user_id}/requests` menolak request masuk. Penerimaan dan penolakan tetap menggunakan ID pengguna.
- `DELETE /contacts/{user_id}` menghapus pertemanan.

Semua endpoint tersebut membutuhkan access token dan tidak membutuhkan body untuk mutasi.

### Group invitations

- Anggota aktif: `GET /conversations/{conversation_id}/members`. Endpoint memerlukan access token dan hanya dapat dipakai anggota aktif grup. Response `data` berupa array dengan `user_id`, `username`, `first_name`, `last_name`, dan `role`; anggota yang sudah keluar tidak disertakan. Frontend memakai daftar ini untuk panel anggota grup dan untuk menentukan apakah pengguna saat ini owner/admin.
- Undang: `POST /conversations/{conversation_id}/invitations` dengan `{"user_id": 24}`.
- Daftar: `GET /group-invitations`.
- Terima: `POST /group-invitations/{invitation_id}/accept`.
- Tolak: `DELETE /group-invitations/{invitation_id}`.

Hanya owner/admin yang dapat mengundang; undangan ditujukan ke kontak accepted. Frontend menampilkan anggota aktif dari endpoint members dan menyediakan pemilih kontak untuk mengirim undangan. Backend tetap wajib memeriksa role dan status kontak; pembatasan UI bukan kontrol akses. Error `409` berarti konflik seperti undangan pending atau anggota sudah ada; tampilkan pesan yang sesuai dan refresh daftar anggota. Tombol buat tautan undangan pada UI masih placeholder dan belum mengirim request karena endpoint pembuatan tautan belum tersedia.

## 8. Error handling dan lifecycle

- HTTP `401`: token tidak valid/expired/revoked. Refresh sekali; jika refresh gagal, hapus session dan minta login.
- HTTP `403`: pengguna tidak berhak mengakses conversation/action atau bukan kontak accepted.
- HTTP `404`: data/conversation/message tidak ditemukan.
- HTTP `409`: conflict, misalnya idempotency key digunakan dengan isi berbeda atau undangan duplikat.
- WebSocket `error`: tampilkan `event.error`; server tidak menyertakan request ID untuk mengaitkan error ke satu frame.
- WebSocket memvalidasi token setiap 15 detik. Token tidak dapat diperbarui pada socket yang sedang terbuka; setelah access token dirotasi, buka koneksi baru dengan token terbaru, autentikasi ulang, lalu join ulang.
- WebSocket close: reconnect dengan exponential backoff dan jitter di production. Ambil token valid lagi sebelum membuka koneksi baru.
- Setelah reconnect, lakukan autentikasi dan `conversation.join` lagi, lalu sinkronkan history untuk mengisi event yang mungkin terlewat.
- Hindari membuat socket baru pada setiap render. Gunakan hook/service yang mengelola cleanup; tutup socket saat logout, user berubah, atau conversation tidak lagi aktif.
- Jika tab menjadi hidden atau jaringan terputus, jangan menganggap event terkirim/diterima; sinkronkan ulang melalui REST/WebSocket history saat kembali.

Contoh di atas adalah skeleton integrasi, bukan state management lengkap. Untuk aplikasi lebih besar, letakkan session dan WebSocket manager pada provider/service bersama, sedangkan komponen UI mengonsumsi state melalui Context atau library state yang dipilih.

## 9. Checklist sebelum production

- [ ] Jalankan seluruh migrasi database dan verifikasi endpoint `/health`.
- [ ] Atur `CORS_ALLOW_ORIGINS` ke origin frontend yang tepat; izinkan `PATCH` dan header `Authorization`.
- [ ] Gunakan HTTPS/WSS; jangan mengirim token lewat URL atau log.
- [ ] Atur masa berlaku token backend sesuai kebutuhan dan implementasikan refresh terkoordinasi; default `EXPIRE_TOKEN` pada konfigurasi adalah 40 detik.
- [ ] Bersihkan access dan refresh token lokal saat logout; backend logout saat ini hanya mencabut access token.
- [ ] Implementasikan retry WS dengan backoff, re-auth, join ulang, dan sinkronisasi history.
- [ ] Pertahankan `client_message_id` yang sama untuk retry kirim pesan.
- [ ] Tampilkan loading, empty, offline, auth-expired, forbidden, conflict, dan error state.
- [ ] Jangan mengaktifkan UI upload media seolah-olah didukung; backend belum menyediakan upload storage.
