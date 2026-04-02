import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

function isFunctionNode(node) {
  return (
    node?.type === 'FunctionDeclaration' ||
    node?.type === 'FunctionExpression' ||
    node?.type === 'ArrowFunctionExpression'
  )
}

function isComponentFunction(node) {
  if (!isFunctionNode(node)) {
    return false
  }

  if (node.type === 'FunctionDeclaration') {
    return Boolean(node.id?.name && /^[A-Z]/.test(node.id.name))
  }

  const variableName = node.parent?.type === 'VariableDeclarator' ? node.parent.id?.name : ''
  return Boolean(variableName && /^[A-Z]/.test(variableName))
}

const bfitStabilityPlugin = {
  rules: {
    'no-setstate-in-render': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow calling React state setters directly during render.',
        },
        schema: [],
      },
      create(context) {
        return {
          CallExpression(node) {
            if (node.callee?.type !== 'Identifier' || !/^set[A-Z]/.test(node.callee.name)) {
              return
            }

            const sourceCode = context.sourceCode || context.getSourceCode()
            const ancestors = sourceCode.getAncestors(node)

            let componentFunction = null
            let componentIndex = -1

            for (let index = ancestors.length - 1; index >= 0; index -= 1) {
              if (isComponentFunction(ancestors[index])) {
                componentFunction = ancestors[index]
                componentIndex = index
                break
              }
            }

            if (!componentFunction || componentIndex === -1) {
              return
            }

            const nestedFunctionExists = ancestors
              .slice(componentIndex + 1)
              .some((ancestor) => isFunctionNode(ancestor))

            if (nestedFunctionExists) {
              return
            }

            context.report({
              node,
              message:
                'Do not call state setters during render. Move this update into an event handler or useEffect.',
            })
          },
        }
      },
    },
  },
}

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      bfit: bfitStabilityPlugin,
    },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      'bfit/no-setstate-in-render': 'error',
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
