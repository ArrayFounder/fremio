#!/usr/bin/env python3
"""Fix Pricing.jsx: replace membership-plus-section with new Fremio Share section."""

pricing_file = '/Users/salwa/Documents/fremio/my-app/src/pages/Pricing.jsx'

new_section = """        {/* ── Fremio Share — photo preview & CTA ── */}
        <div className="share-plus-section" style={{ marginTop: '32px', paddingTop: '28px', borderTop: '1px solid rgba(236,222,218,0.6)' }}>
          {/* Brief */}
          <p style={{ textAlign: 'center', fontSize: '16px', color: '#475569', margin: '0 auto 24px', maxWidth: '540px', lineHeight: 1.5 }}>
            QR Code yang terhubung ke frame brand/event mu
          </p>

          {/* Preview images — 2-col mosaic */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '10px', margin: '0 auto 32px', maxWidth: '740px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { src: membershipPlusQrcode,   alt: 'QR Code',      pos: 'center' },
                { src: membershipPlusLinkPage, alt: 'Halaman link', pos: 'top' },
                { src: membershipPlusTakephoto,alt: 'Ambil foto',   pos: 'center bottom' },
              ].map(({ src, alt, pos }) => (
                <div key={alt} className="mp-thumb" style={{ height: '150px', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.10)', cursor: 'zoom-in' }} onClick={() => setLightboxImg(src)}>
                  <img src={src} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos, display: 'block' }} />
                </div>
              ))}
            </div>
            <div className="mp-thumb" style={{ height: '470px', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.10)', cursor: 'zoom-in' }} onClick={() => setLightboxImg(membershipPlusMockup)}>
              <img src={membershipPlusMockup} alt="Mockup" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
            </div>
          </div>

          {/* Lightbox */}
          {lightboxImg && (
            <div onClick={() => setLightboxImg(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '72px 24px 24px', cursor: 'zoom-out', animation: 'mpFadeIn 0.2s ease' }}>
              <img src={lightboxImg} alt="Preview" onClick={e => e.stopPropagation()} style={{ maxWidth: '70vw', maxHeight: '75vh', borderRadius: '12px', boxShadow: '0 8px 48px rgba(0,0,0,0.5)', animation: 'mpZoomIn 0.25s ease', objectFit: 'contain' }} />
              <button onClick={() => setLightboxImg(null)} style={{ position: 'fixed', top: '72px', right: '24px', background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: '22px', lineHeight: 1, width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
          )}

          {/* Active subscription banner */}
          {sharePlusStatus?.hasSubscription && (
            <div className="share-plus-active-banner">
              <span>✅ <strong>Membership Plus {SHARE_PLUS_PLANS[sharePlusStatus.subscription?.tier]?.label || sharePlusStatus.subscription?.tier}</strong> aktif</span>
              <span style={{ fontSize: '12px', color: '#15803d' }}>
                {sharePlusStatus.subscription?.daily_quota} tamu/hari · berakhir{' '}
                {new Date(sharePlusStatus.subscription?.expires_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          )}

          <p className="share-plus-footnote">
            * Akses dihitung per <em>unique device</em>. Satu perangkat membuka link (termasuk refresh berulang)
            hanya dihitung satu kali per hari. Kuota reset setiap jam 12 malam.
          </p>

          {/* CTA: Lihat cara kerjanya */}
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <button
              type="button"
              onClick={() => { navigate('/shares', { state: { startTutorial: true } }); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 28px', background: 'linear-gradient(135deg, #e0b7a9, #c89585)', color: '#fff', border: 'none', borderRadius: '999px', fontWeight: '700', fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(200,149,133,0.4)', transition: 'transform 0.15s, box-shadow 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(200,149,133,0.5)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 14px rgba(200,149,133,0.4)'; }}
            >
              ▶ Lihat cara kerjanya
            </button>
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#7a5248', lineHeight: 1.5 }}>
                Masih ragu? Boleh DM kami di Instagram untuk tanya-tanya dulu.
              </p>
              <a href="https://instagram.com/fremio.id" target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#fff', color: '#c89585', border: '1px solid rgba(200,149,133,0.35)', borderRadius: '999px', fontWeight: '700', fontSize: '14px', textDecoration: 'none', boxShadow: '0 10px 24px rgba(200,149,133,0.14)', transition: 'transform 0.15s, box-shadow 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 14px 28px rgba(200,149,133,0.18)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 10px 24px rgba(200,149,133,0.14)'; }}
              >
                <img src={instagramLogo} alt="Instagram" style={{ width: '18px', height: '18px', objectFit: 'contain', display: 'block' }} />
                <span>DM Instagram @fremio.id</span>
              </a>
            </div>
          </div>
        </div>
"""

with open(pricing_file) as f:
    lines = f.readlines()

print(f"Original lines: {len(lines)}")
print(f"Line 948 (idx 947): {repr(lines[947][:60])}")
print(f"Line 1210 (idx 1209): {repr(lines[1209][:60])}")
print(f"Line 1211 (idx 1210): {repr(lines[1210][:60])}")

# Replace lines 948-1210 (1-indexed) = indices 947-1209 (0-indexed, inclusive)
new_lines = lines[:947] + [new_section] + lines[1210:]

with open(pricing_file, 'w') as f:
    f.writelines(new_lines)

print(f"New file lines: {len(new_lines)}")
print("Done!")
