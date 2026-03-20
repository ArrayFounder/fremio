import { useSEO } from "../hooks/useSEO.js";

export default function AboutUs() {
  useSEO({
    title: "Tentang Fremio - Photo Booth Online Indonesia",
    description: "Kenali Fremio, platform photo booth online dan photobox virtual terbaik di Indonesia. Kami hadir untuk mengabadikan momen spesial kamu.",
    canonical: "https://fremio.id/about-us",
  });

  const teamMembers = [
    {
      name: "Razzaqu Raydan",
      role: "Founder & CEO",
      photo: "👨‍💼",
      bio: "Visioner di balik Fremio dengan passion untuk fotografi dan teknologi.",
    },
    {
      name: "Sarah Wijaya",
      role: "Creative Director",
      photo: "👩‍🎨",
      bio: "Mendesain experience yang memorable untuk setiap user.",
    },
    {
      name: "Budi Santoso",
      role: "Lead Developer",
      photo: "👨‍💻",
      bio: "Membangun teknologi yang membuat Fremio semakin powerful.",
    },
    {
      name: "Rina Putri",
      role: "Marketing Manager",
      photo: "👩‍💼",
      bio: "Membawa Fremio ke lebih banyak orang di seluruh Indonesia.",
    },
  ];

  const milestones = [
    {
      year: "2023",
      title: "Fremio Didirikan",
      desc: "Memulai perjalanan untuk revolutionize cara orang membuat frame foto",
    },
    {
      year: "2024",
      title: "10K+ Users",
      desc: "Mencapai milestone 10.000 users aktif di seluruh Indonesia",
    },
    {
      year: "2024",
      title: "Frame Builder Launch",
      desc: "Meluncurkan fitur custom frame builder untuk kreativitas tanpa batas",
    },
    {
      year: "2025",
      title: "AI Integration",
      desc: "Mengintegrasikan AI untuk auto-detect faces dan smart frame suggestions",
    },
  ];

  return (
    <section className="anchor about-wrap">
      <div className="container">
        {/* Hero Section */}
        <div className="about-hero">
          <h1>🎨 About Fremio</h1>
          <p className="tagline">Think Outside The Box!</p>
          <p className="description">
            Fremio adalah platform inovatif yang memudahkan siapa saja untuk
            membuat photo frames yang indah dan personal. Kami percaya setiap
            momen berharga untuk diabadikan dengan cara yang unik dan creative.
          </p>
        </div>

        {/* Mission & Vision */}
        <div className="mv-section">
          <div className="mv-card">
            <div className="mv-icon">🎯</div>
            <h3>Our Mission</h3>
            <p>
              Memberdayakan setiap orang untuk mengekspresikan kreativitas
              mereka melalui photo frames yang personal dan bermakna. Kami ingin
              membuat proses pembuatan frame menjadi mudah, menyenangkan, dan
              accessible untuk semua.
            </p>
          </div>

          <div className="mv-card">
            <div className="mv-icon">👁️</div>
            <h3>Our Vision</h3>
            <p>
              Menjadi platform #1 di Indonesia untuk photo frame creation, di
              mana setiap orang bisa mewujudkan ide creative mereka dan
              membagikan memories yang berharga dengan cara yang unique dan
              inspiring.
            </p>
          </div>
        </div>

        {/* Values */}
        <div className="values-section">
          <h2>💎 Our Values</h2>
          <div className="values-grid">
            <div className="value-card">
              <div className="value-icon">🚀</div>
              <h4>Innovation</h4>
              <p>Terus berinovasi untuk memberikan pengalaman terbaik</p>
            </div>

            <div className="value-card">
              <div className="value-icon">❤️</div>
              <h4>User-Centric</h4>
              <p>User adalah prioritas utama dalam setiap keputusan kami</p>
            </div>

            <div className="value-card">
              <div className="value-icon">🎨</div>
              <h4>Creativity</h4>
              <p>Mendorong kreativitas tanpa batas untuk semua user</p>
            </div>

            <div className="value-card">
              <div className="value-icon">🤝</div>
              <h4>Community</h4>
              <p>Membangun komunitas yang supportive dan collaborative</p>
            </div>

            <div className="value-card">
              <div className="value-icon">⚡</div>
              <h4>Quality</h4>
              <p>Mengutamakan kualitas dalam setiap aspek produk</p>
            </div>

            <div className="value-card">
              <div className="value-icon">🌱</div>
              <h4>Growth</h4>
              <p>Bertumbuh bersama dengan komunitas dan technology</p>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="timeline-section">
          <h2>📅 Our Journey</h2>
          <div className="timeline">
            {milestones.map((milestone, index) => (
              <div key={index} className="timeline-item">
                <div className="timeline-year">{milestone.year}</div>
                <div className="timeline-content">
                  <h4>{milestone.title}</h4>
                  <p>{milestone.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team */}
        <div className="team-section">
          <h2>👥 Meet Our Team</h2>
          <p className="team-subtitle">
            Tim passionate yang bekerja untuk membuat Fremio lebih baik setiap
            hari
          </p>
          <div className="team-grid">
            {teamMembers.map((member, index) => (
              <div key={index} className="team-card">
                <div className="member-photo">{member.photo}</div>
                <h4>{member.name}</h4>
                <p className="member-role">{member.role}</p>
                <p className="member-bio">{member.bio}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="stats-section">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-number">15K+</div>
              <div className="stat-label">Active Users</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">50K+</div>
              <div className="stat-label">Frames Created</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">200+</div>
              <div className="stat-label">Templates</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">4.8⭐</div>
              <div className="stat-label">User Rating</div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="cta-section">
          <h2>🚀 Join Us on This Journey</h2>
          <p>Mulai ciptakan frame yang amazing sekarang!</p>
          <div className="cta-buttons">
            <a href="/frames" className="cta-btn primary">
              Explore Frames
            </a>
            <a href="/register" className="cta-btn secondary">
              Create Account
            </a>
          </div>
        </div>
      </div>

      <style jsx>{`
        .about-wrap {
          min-height: calc(100vh - 200px);
          padding: 60px 0;
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        }

        .about-hero {
          text-align: center;
          max-width: 800px;
          margin: 0 auto 80px;
        }

        .about-hero h1 {
          font-size: 3rem;
          margin-bottom: 16px;
          color: #111;
        }

        .tagline {
          font-size: 1.5rem;
          color: #e0b7a9;
          font-weight: 700;
          margin-bottom: 24px;
        }

        .description {
          font-size: 1.1rem;
          line-height: 1.8;
          color: #475569;
        }

        .mv-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          margin-bottom: 80px;
        }

        .mv-card {
          background: white;
          padding: 40px;
          border-radius: 16px;
          border: 2px solid #e2e8f0;
          text-align: center;
        }

        .mv-icon {
          font-size: 4rem;
          margin-bottom: 20px;
        }

        .mv-card h3 {
          font-size: 1.8rem;
          margin-bottom: 16px;
          color: #111;
        }

        .mv-card p {
          font-size: 1.05rem;
          line-height: 1.7;
          color: #475569;
          margin: 0;
        }

        .values-section {
          margin-bottom: 80px;
        }

        .values-section h2 {
          font-size: 2.2rem;
          text-align: center;
          margin-bottom: 40px;
          color: #111;
        }

        .values-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        .value-card {
          background: white;
          padding: 30px;
          border-radius: 12px;
          border: 2px solid #e2e8f0;
          text-align: center;
          transition: all 0.3s;
        }

        .value-card:hover {
          border-color: #e0b7a9;
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
        }

        .value-icon {
          font-size: 3rem;
          margin-bottom: 16px;
        }

        .value-card h4 {
          font-size: 1.3rem;
          margin-bottom: 10px;
          color: #111;
        }

        .value-card p {
          font-size: 0.95rem;
          color: #64748b;
          margin: 0;
        }

        .timeline-section {
          margin-bottom: 80px;
        }

        .timeline-section h2 {
          font-size: 2.2rem;
          text-align: center;
          margin-bottom: 50px;
          color: #111;
        }

        .timeline {
          max-width: 800px;
          margin: 0 auto;
          position: relative;
        }

        .timeline::before {
          content: "";
          position: absolute;
          left: 80px;
          top: 0;
          bottom: 0;
          width: 3px;
          background: linear-gradient(to bottom, #e0b7a9, #c89585);
        }

        .timeline-item {
          display: flex;
          gap: 30px;
          margin-bottom: 40px;
          position: relative;
        }

        .timeline-year {
          width: 80px;
          font-size: 1.5rem;
          font-weight: 700;
          color: #e0b7a9;
          flex-shrink: 0;
          text-align: right;
        }

        .timeline-content {
          background: white;
          padding: 24px;
          border-radius: 12px;
          border: 2px solid #e2e8f0;
          flex: 1;
          position: relative;
        }

        .timeline-content::before {
          content: "";
          position: absolute;
          left: -12px;
          top: 20px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #e0b7a9;
          border: 4px solid white;
          box-shadow: 0 0 0 2px #e0b7a9;
        }

        .timeline-content h4 {
          font-size: 1.3rem;
          margin-bottom: 8px;
          color: #111;
        }

        .timeline-content p {
          font-size: 1rem;
          color: #64748b;
          margin: 0;
        }

        .team-section {
          margin-bottom: 80px;
        }

        .team-section h2 {
          font-size: 2.2rem;
          text-align: center;
          margin-bottom: 12px;
          color: #111;
        }

        .team-subtitle {
          text-align: center;
          font-size: 1.05rem;
          color: #64748b;
          margin-bottom: 40px;
        }

        .team-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }

        .team-card {
          background: white;
          padding: 30px;
          border-radius: 12px;
          border: 2px solid #e2e8f0;
          text-align: center;
          transition: all 0.3s;
        }

        .team-card:hover {
          border-color: #e0b7a9;
          transform: translateY(-4px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
        }

        .member-photo {
          font-size: 5rem;
          margin-bottom: 16px;
        }

        .team-card h4 {
          font-size: 1.2rem;
          margin-bottom: 6px;
          color: #111;
        }

        .member-role {
          font-size: 0.9rem;
          color: #e0b7a9;
          font-weight: 600;
          margin-bottom: 12px;
        }

        .member-bio {
          font-size: 0.9rem;
          color: #64748b;
          margin: 0;
        }

        .stats-section {
          margin-bottom: 80px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }

        .stat-card {
          background: linear-gradient(135deg, #e0b7a9 0%, #c89585 100%);
          padding: 40px 20px;
          border-radius: 12px;
          text-align: center;
          color: white;
        }

        .stat-number {
          font-size: 3rem;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .stat-label {
          font-size: 1rem;
          opacity: 0.95;
        }

        .cta-section {
          background: white;
          padding: 60px;
          border-radius: 16px;
          text-align: center;
          border: 2px solid #e2e8f0;
        }

        .cta-section h2 {
          font-size: 2.2rem;
          margin-bottom: 12px;
          color: #111;
        }

        .cta-section > p {
          font-size: 1.1rem;
          color: #64748b;
          margin-bottom: 30px;
        }

        .cta-buttons {
          display: flex;
          gap: 16px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .cta-btn {
          padding: 16px 32px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          font-size: 1.05rem;
          transition: all 0.3s;
        }

        .cta-btn.primary {
          background: linear-gradient(135deg, #e0b7a9 0%, #c89585 100%);
          color: white;
        }

        .cta-btn.secondary {
          background: white;
          color: #e0b7a9;
          border: 2px solid #e0b7a9;
        }

        .cta-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.15);
        }

        @media (max-width: 1024px) {
          .values-grid,
          .team-grid,
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .about-hero h1 {
            font-size: 2.2rem;
          }

          .mv-section {
            grid-template-columns: 1fr;
          }

          .values-grid,
          .team-grid,
          .stats-grid {
            grid-template-columns: 1fr;
          }

          .timeline::before {
            left: 60px;
          }

          .timeline-year {
            width: 60px;
            font-size: 1.2rem;
          }

          .cta-buttons {
            flex-direction: column;
          }

          .cta-btn {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
