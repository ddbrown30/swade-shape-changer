import js from "@eslint/js";
import globals from "globals";

export default [
    {
        ignores: [
            ".github/**",
            "build/**",
            "node_modules/**",
        ],
    },

    js.configs.recommended,

    {
        files: ["**/*.js"],

        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",

            globals: {
                ...globals.browser,

                // Foundry core globals
                game: "readonly",
                ui: "readonly",
                Hooks: "readonly",
                CONFIG: "readonly",
                foundry: "readonly",
                // Canvas / rendering
                canvas: "readonly",
                PIXI: "readonly",
                Roll: "readonly",

                // Documents
                Actor: "readonly",
                Item: "readonly",
                Scene: "readonly",
                Token: "readonly",
                ChatMessage: "readonly",

                // UI / apps
                Dialog: "readonly",
                Application: "readonly",
                FormApplication: "readonly",
                TextEditor: "readonly",
                Handlebars: "readonly",
                FilePicker: "readonly",

                // Utilities / constants
                CONST: "readonly",
                fromUuid: "readonly",
                fromUuidSync: "readonly",

                socketlib: "readonly",
                Sequencer: "readonly",
                Sequence: "readonly",
            },
        },

        rules: {
            "no-undef": "error",
            "no-unused-vars": ["error", {
                argsIgnorePattern: "^_",
                destructuredArrayIgnorePattern: "^_",
                caughtErrors: "none"
            }]
        },
    },
];