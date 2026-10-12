import '../AuthLayout.css'

function BrandMark() {
  return (
    <span className="login-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" />
      </svg>
    </span>
  )
}

function AuthLayout({ kicker, title, description, children }) {
  return (
    <main className="login-page">
      <section className="login-showcase" aria-label="Tentang Lechat">
        <div className="login-brand" aria-label="Lechat">
          <BrandMark />
          <span>lechat</span>
        </div>

        <div className="showcase-copy">
          <span className="showcase-eyebrow"><i /> RUANG UNTUK TERHUBUNG</span>
          <h1>Percakapan baik<br />dimulai dari sini.</h1>
          <p>Tempat nyaman untuk berbagi cerita, bertukar ide, dan tetap dekat dengan orang-orang penting.</p>
        </div>

        <div className="showcase-chat" aria-hidden="true">
          <div className="showcase-chat-heading">
            <span className="showcase-avatar">NP<i /></span>
            <span><strong>Nadia Putri</strong><small>online sekarang</small></span>
            <span className="showcase-menu">•••</span>
          </div>
          <div className="showcase-date">HARI INI</div>
          <div className="showcase-message received">Punya rekomendasi tempat ngopi yang tenang?</div>
          <div className="showcase-message sent">Ada! Aku kirim lokasinya ya ☕</div>
          <div className="showcase-message received short">Wah, terima kasih! ✨</div>
          <div className="showcase-chat-foot"><span>● ● ●</span> Nadia sedang mengetik</div>
        </div>

        <div className="showcase-footer">
          <span>Pribadi, hangat, dan selalu dekat.</span>
          <span className="showcase-dots"><i /><i /><i /></span>
        </div>
      </section>

      <section className="login-content">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <BrandMark />
            <span>lechat</span>
          </div>
          <span className="login-kicker">{kicker}</span>
          <h2>{title}</h2>
          <p className="login-intro">{description}</p>
          {children}
        </div>
        <footer className="login-footer">
          <span>© 2026 Lechat</span>
          <span>Privasi <i /> Bantuan</span>
        </footer>
      </section>
    </main>
  )
}

export default AuthLayout
