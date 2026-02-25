import { NavLink, useEffect } from "react-router-dom";
import frame1 from "../assets/frame1_ramadan.png";
import frame2 from "../assets/frame2_ramadan.png";
import frame3 from "../assets/frame3_ramadan.png";
import ProfileIcon from "../assets/profile-icon.png";

export default function HomeLoggedIn() {
  useEffect(() => {
    console.log("HomeLoggedIn component mounted");
    // Add any API call or debugging logic here
  }, []);

  return (
    <>
      {/* ======= HERO (/#home) ======= */}
      <section
        id="home"
        className="hero-fremio"
        style={{ scrollMarginTop: "64px" }}
      >
        <div className="container hero-grid">
          {/* LEFT */}
          <div className="hero-left">
            <h1 className="hero-h1">
              Welcome Back to <span className="accent">Fremio</span>
            </h1>

            <p className="hero-sub">
              Celebrate your moments with Fremio. Choose a frame, print
              instantly, and make your memories come alive.
            </p>

            <NavLink to="/frames" className="cta-pink">
              Get Started
            </NavLink>

            {/* dekorasi: kamera + roll film */}
            <CameraIcon className="deco cam-tl" />
            <FilmIcon className="deco film-tc" />
            <CameraIcon className="deco cam-bl" />
            <FilmIcon className="deco film-bc" />
          </div>

          {/* RIGHT – kolase */}
          <div className="hero-right">
            <img src={ProfileIcon} alt="Profile" className="profile-icon" />
          </div>
        </div>
      </section>
    </>
  );
}
