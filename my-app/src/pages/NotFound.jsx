import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <section className="container pad center">
      <h2>{t("notfound.title")}</h2>
      <NavLink to="/" className="btn">
        {t("notfound.cta")}
      </NavLink>
    </section>
  );
}
