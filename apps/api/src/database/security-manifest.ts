// Reviewed function bodies from immutable access migration; update only with reviewed SQL.
export const functionHashes: Record<string,string> = {
  "resolve_context": "4993b69300429e2ca9b05d5f3dd6075073b0dcbf17e920e12a35bd8e5854c46d",
  "can_access": "d9c675fd265d9d98aade5f057500291660ecb5161f01df964f5b8f9d38075406",
  "is_owner": "f1b0b2c076d2094e1489af1025d3091af850bd199d42420bd400cbc56b466a5c"
};
export const accessMigrationChecksum = '825df8a98a1559978697ee64e423d7a87686d19686905532309674b67e07eb36';

export const authFunctions = {
  "throttle": {
    "args": "text, integer",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "2228e946443823d657bb401d6d6e9b6fd3616a7e890e1bdc5b9e8f3bbce5c1c0"
  },
  "credentials": {
    "args": "text",
    "language": "sql",
    "volatility": "s",
    "hash": "7d49d86c7f13e9c335bef548c23a9ab5ebd74ceb00044c943f3b88860180b323"
  },
  "login": {
    "args": "text, text, text",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "710d17624e6bfac1714646ab9260e0817e316178b6b0f794b19263e006cd23b6"
  },
  "register_owner": {
    "args": "text, text, text",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "5020f44bff5f513f289e73498e3926d04fab60d4f7f5e725573b5b0710b498d4"
  },
  "session_info": {
    "args": "text",
    "language": "sql",
    "volatility": "s",
    "hash": "87a56a8a93dc16b399db319f8713dae1ad63b36df53956566e2a2593df3190a9"
  },
  "onboard": {
    "args": "text, text, text",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "4c395d3c619c70fbfa334bffe2bd19c55dca793cadace6f2067cbd31ba5d9de5"
  },
  "logout": {
    "args": "text",
    "language": "sql",
    "volatility": "v",
    "hash": "2d338d332dac4836ff0bf1303321a92f76b340fa809a47bab8238e68438440e8"
  },
  "request_reset": {
    "args": "text, text",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "7f95426a451496f065336acb9f19323f654f700b925880e9bf53df5438ec7f96"
  },
  "reset_password": {
    "args": "text, text",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "9bca0d70a307c9bca8b47eeadecc0d6e45c45c67543ae5bff3ae222c308179a2"
  }
};

export const organisationFunctions = {
  "organisation_read": {
    "args": "uuid",
    "language": "plpgsql",
    "volatility": "s",
    "hash": "8dcc22c896657a7cf21a59cc4299f3e39ee1d872c6c383727a4fc468e65f398d"
  },
  "save_location": {
    "args": "uuid, text, uuid, uuid, text, text, text, text, boolean",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "115da2941f846606ff0d96295f131b1cea0c2010166240a3efb73831d8b775b0"
  },
  "save_staff": {
    "args": "uuid, uuid, text, text, text, boolean, jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "71b646440908a26017a10e5d0482b1d2c08be8c15c8583d53471531dfda134d1"
  }
};
