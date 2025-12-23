import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: `${window.location.protocol}//${window.location.host}/auth`,
  realm: "residencyflow",
  clientId: "residencyflow-frontend",
});

export default keycloak;
