import type { Messages } from "./config";

// DRAFT SPANISH - to be verified by a fluent speaker on the team before launch.
// Typed as Messages, so it must match en.ts key-for-key or the build fails.
// Only the string values need reviewing; the keys and shape are fixed.
export const es: Messages = {
  common: {
    signIn: "Iniciar sesión",
    signUp: "Crear cuenta",
    save: "Guardar",
    saving: "Guardando...",
    cancel: "Cancelar",
    done: "Listo",
    continue: "Continuar",
    loading: "Cargando...",
    retry: "Reintentar",
  },

  language: {
    label: "Idioma",
    system: "Según mi dispositivo",
  },

  nav: {
    feed: "Feed",
    explore: "Explorar",
    tickets: "Entradas",
    profile: "Perfil",
  },

  landing: {
    tagline: "Conciertos y bolos locales",
    fanTitle: "Soy fan",
    fanDescription: "Descubre eventos, compra entradas, disfruta",
    artistTitle: "Soy artista",
    artistDescription: "Reclama tu perfil, vende tus bolos",
    artistBadge: "Artista",
    haveAccount: "¿Ya tienes cuenta?",
  },

  signin: {
    title: "Bienvenido de nuevo",
    subtitle: "Inicia sesión para seguir al lío.",
    identifierLabel: "Email o usuario",
    passwordLabel: "Contraseña",
    forgotPassword: "¿Olvidaste la contraseña?",
    submit: "Iniciar sesión",
    submitting: "Iniciando sesión...",
    orDivider: "o",
    withGoogle: "Iniciar sesión con Google",
    noAccount: "¿No tienes cuenta?",
    errorIdentifier: "Introduce tu email o usuario",
    errorPassword: "Introduce tu contraseña",
    errorWrong: "Email o contraseña incorrectos",
  },

  signup: {
    fanBadge: "Fan",
    artistBadge: "Artista",
    title: "Crea tu cuenta",
    subtitle: "Te configuramos en un minuto.",
    withGoogle: "Registrarse con Google",
    orWithEmail: "o con email",
    usernameLabel: "Usuario",
    usernamePlaceholder: "hardfuse",
    usernameHint: "Sin espacios. Letras, números, puntos, guiones y guiones bajos.",
    usernameTaken: "Ese usuario ya está cogido",
    usernameAvailable: "Usuario disponible",
    emailLabel: "Email",
    dobLabel: "Fecha de nacimiento",
    passwordLabel: "Contraseña",
    confirmPasswordLabel: "Confirmar contraseña",
    submit: "Continuar",
    submitting: "Creando cuenta...",
    haveAccount: "¿Ya tienes cuenta?",
    errorUsernameRequired: "El usuario es obligatorio",
    errorUsernameSpaces: "El usuario no puede tener espacios",
    errorUsernameFormat: "Usa 3-30 letras, números, puntos, guiones o guiones bajos",
    errorEmail: "Introduce un email válido",
    errorPassword: "Usa al menos 8 caracteres",
    errorConfirm: "Las contraseñas no coinciden",
    errorDob: "Introduce tu fecha de nacimiento",
    errorTooYoung: "Debes tener al menos {age} años para unirte a MadGigz",
    errorCaptcha: "Completa la verificación de abajo",
  },

  settings: {
    title: "Ajustes",
    editProfile: "Editar perfil",
    editProfilePhoto: "Foto",
    editProfileBioPhoto: "Bio y foto",
    sendFeedback: "Enviar comentarios",
    sendFeedbackHint: "Fallo, ayuda o una idea",
    comingSoon: "Pronto",
  },

  profile: {
    attended: "Asistidos",
    saved: "Guardados",
    logOut: "Cerrar sesión",
    deleteAccount: "Eliminar mi cuenta",
  },
};
