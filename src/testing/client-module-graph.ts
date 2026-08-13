import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/** 브라우저 모듈 하나가 참조하는 import 경로와 해석 결과다. */
export type ClientImport = {
  importer: string;
  specifier: string;
  target: string | null;
};

/** 실제 브라우저 진입점에서 도달 가능한 모듈과 import 목록이다. */
export type ClientModuleGraph = {
  files: Set<string>;
  imports: ClientImport[];
};

/** Vite production 빌드의 두 HTML 진입점이 실행하는 TypeScript 모듈을 반환한다. */
export function resolveClientEntryPoints(projectRoot: string): string[] {
  const srcRoot = path.join(projectRoot, 'src');
  return [
    path.join(srcRoot, 'main.ts'),
    path.join(srcRoot, 'tools', 'card-text', 'client', 'main.ts'),
  ];
}

/**
 * 브라우저 진입점에서 정적·동적 import와 `import.meta.glob`을 재귀적으로 따라간다.
 * 타입 전용 import는 production 번들에서 지워지므로 그래프에서 제외한다.
 */
export function collectClientModuleGraph(options: {
  projectRoot: string;
  entryPoints: readonly string[];
}): ClientModuleGraph {
  const files = new Set<string>();
  const imports: ClientImport[] = [];
  const pending = [...options.entryPoints];

  while (pending.length > 0) {
    const importer = pending.pop()!;
    if (files.has(importer)) {
      continue;
    }
    files.add(importer);

    for (const specifier of listRuntimeImportSpecifiers(importer)) {
      const target = resolveImportTarget(importer, specifier, options.projectRoot);
      imports.push({ importer, specifier, target });
      if (target && (target.endsWith('.ts') || target.endsWith('.tsx'))) {
        pending.push(target);
      }
    }
  }

  return { files, imports };
}

function listRuntimeImportSpecifiers(filePath: string): string[] {
  const source = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const specifiers: string[] = [];

  const addSpecifier = (node: ts.Expression | undefined): void => {
    if (node && ts.isStringLiteralLike(node)) {
      specifiers.push(node.text);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && hasRuntimeImport(node)) {
      addSpecifier(node.moduleSpecifier);
    } else if (ts.isExportDeclaration(node) && hasRuntimeExport(node)) {
      addSpecifier(node.moduleSpecifier);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || isImportMetaGlob(node)) {
        addSpecifier(node.arguments[0]);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
}

function hasRuntimeImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) {
    return true;
  }
  if (clause.isTypeOnly) {
    return false;
  }
  if (clause.name || !clause.namedBindings || ts.isNamespaceImport(clause.namedBindings)) {
    return true;
  }

  return clause.namedBindings.elements.some((element) => !element.isTypeOnly);
}

function hasRuntimeExport(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly || !node.moduleSpecifier) {
    return false;
  }
  if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) {
    return true;
  }

  return node.exportClause.elements.some((element) => !element.isTypeOnly);
}

function isImportMetaGlob(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'glob') {
    return false;
  }

  const expression = unwrapExpression(node.expression.expression);
  return (
    ts.isMetaProperty(expression) &&
    expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    expression.name.text === 'meta'
  );
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }

  return current;
}

function resolveImportTarget(
  filePath: string,
  specifier: string,
  projectRoot: string,
): string | null {
  if (specifier.includes('*')) {
    return null;
  }

  const cleanSpecifier = specifier.replace(/[?#].*$/, '');
  const unresolved = cleanSpecifier.startsWith('/src/')
    ? path.join(projectRoot, cleanSpecifier.slice(1))
    : cleanSpecifier.startsWith('.')
      ? path.resolve(path.dirname(filePath), cleanSpecifier)
      : null;
  if (!unresolved) {
    return null;
  }

  const extension = path.extname(unresolved);
  const candidates = extension
    ? extension === '.js'
      ? [unresolved, `${unresolved.slice(0, -3)}.ts`, `${unresolved.slice(0, -3)}.tsx`]
      : [unresolved]
    : [
        `${unresolved}.ts`,
        `${unresolved}.tsx`,
        `${unresolved}.json`,
        path.join(unresolved, 'index.ts'),
        path.join(unresolved, 'index.tsx'),
      ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}
