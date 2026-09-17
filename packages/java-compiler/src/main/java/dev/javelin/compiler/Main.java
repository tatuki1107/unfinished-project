package dev.javelin.compiler;

import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.util.JavacTask;

import javax.tools.Diagnostic;
import javax.tools.DiagnosticCollector;
import javax.tools.JavaCompiler;
import javax.tools.JavaFileObject;
import javax.tools.StandardJavaFileManager;
import javax.tools.ToolProvider;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

public final class Main {
    private Main() {
    }

    public static void main(String[] args) throws Exception {
        compile(args);
    }

    public static void compile(String[] args) throws Exception {
        Arguments arguments = Arguments.parse(args);
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("JDK 17 or newer is required (javac is unavailable)");

        List<Path> sourceFiles = new ArrayList<>();
        for (Path sourceRoot : arguments.sourceRoots()) {
            try (var paths = Files.walk(sourceRoot)) {
                sourceFiles.addAll(paths.filter(path -> path.toString().endsWith(".java")).sorted().toList());
            }
        }
        if (sourceFiles.isEmpty()) throw new IllegalArgumentException("No Java sources under " + arguments.sourceRoots());

        DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
        try (StandardJavaFileManager files = compiler.getStandardFileManager(diagnostics, null, StandardCharsets.UTF_8)) {
            Iterable<? extends JavaFileObject> inputs = files.getJavaFileObjectsFromPaths(sourceFiles);
            List<String> compilerOptions = new ArrayList<>(List.of("--release", "17", "-proc:none", "-Xlint:all"));
            if (arguments.classpath() != null && !arguments.classpath().isBlank()) {
                compilerOptions.add("-classpath");
                compilerOptions.add(arguments.classpath());
            }
            JavacTask task = (JavacTask) compiler.getTask(null, files, diagnostics, compilerOptions, null, inputs);
            List<CompilationUnitTree> units = new ArrayList<>();
            task.parse().forEach(units::add);
            task.analyze();
            List<Diagnostic<? extends JavaFileObject>> errors = diagnostics.getDiagnostics().stream()
                    .filter(diagnostic -> diagnostic.getKind() == Diagnostic.Kind.ERROR)
                    .toList();
            errors.forEach(Main::printDiagnostic);
            if (!errors.isEmpty()) throw new IllegalArgumentException("Java type checking failed with " + errors.size() + " error(s)");

            JavaScriptEmitter emitter = new JavaScriptEmitter(task, units, arguments.runtimePath(), arguments.moduleSuffix());
            String output = emitter.emit();
            Files.createDirectories(arguments.output().getParent());
            Files.writeString(arguments.output(), output, StandardCharsets.UTF_8);
            for (var chunk : emitter.lazyChunks().entrySet()) {
                Files.writeString(arguments.output().resolveSibling(chunk.getKey()), chunk.getValue(), StandardCharsets.UTF_8);
            }
        }
    }

    private static void printDiagnostic(Diagnostic<? extends JavaFileObject> diagnostic) {
        String source = diagnostic.getSource() == null ? "<java>" : Path.of(diagnostic.getSource().toUri()).toString();
        System.err.printf("%s:%d:%d: %s%n", source, diagnostic.getLineNumber(), diagnostic.getColumnNumber(),
                diagnostic.getMessage(null));
    }

    private record Arguments(List<Path> sourceRoots, Path output, String runtimePath, String classpath, String moduleSuffix) {
        static Arguments parse(String[] args) {
            List<Path> sourceRoots = new ArrayList<>();
            Path output = null;
            String runtimePath = "/@javelin/runtime.mjs";
            String classpath = null;
            String moduleSuffix = "";
            for (int i = 0; i < args.length; i++) {
                switch (args[i]) {
                    case "--source-root", "--api-source-root" -> sourceRoots.add(Path.of(args[++i]).toAbsolutePath().normalize());
                    case "--output" -> output = Path.of(args[++i]).toAbsolutePath().normalize();
                    case "--runtime-path" -> runtimePath = args[++i];
                    case "--classpath" -> classpath = args[++i];
                    case "--module-suffix" -> moduleSuffix = args[++i];
                    default -> throw new IllegalArgumentException("Unknown argument: " + args[i]);
                }
            }
            if (sourceRoots.isEmpty() || output == null) {
                throw new IllegalArgumentException("Usage: --source-root <dir> --output <file> [--runtime-path <path>]");
            }
            if (!moduleSuffix.isEmpty() && !moduleSuffix.matches("\\?v=[A-Za-z0-9._-]+")) {
                throw new IllegalArgumentException("Invalid module suffix");
            }
            return new Arguments(List.copyOf(sourceRoots), output, runtimePath, classpath, moduleSuffix);
        }
    }
}
