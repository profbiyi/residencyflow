import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: "http://localhost/auth",
  realm: "residencyflow",
  clientId: "residencyflow-frontend",
});

export default keycloak;
