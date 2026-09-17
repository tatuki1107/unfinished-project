package dev.javelin.maven;

import dev.javelin.compiler.Main;
import org.apache.maven.plugin.AbstractMojo;
import org.apache.maven.plugin.MojoExecutionException;
import org.apache.maven.plugins.annotations.LifecyclePhase;
import org.apache.maven.plugins.annotations.Mojo;
import org.apache.maven.plugins.annotations.Parameter;
import org.apache.maven.plugins.annotations.ResolutionScope;
import org.apache.maven.project.MavenProject;

import java.io.File;

@Mojo(name = "compile", defaultPhase = LifecyclePhase.GENERATE_RESOURCES,
        requiresDependencyResolution = ResolutionScope.COMPILE, threadSafe = true)
public final class JavelinCompileMojo extends AbstractMojo {
    @Parameter(defaultValue = "${project.basedir}/src/main/java", required = true)
    private File sourceDirectory;

    @Parameter(defaultValue = "${project.build.directory}/javelin/app.mjs", required = true)
    private File outputFile;

    @Parameter(defaultValue = "/@javelin/runtime.mjs")
    private String runtimePath;

    @Parameter(defaultValue = "${project}", readonly = true, required = true)
    private MavenProject project;

    @Override
    public void execute() throws MojoExecutionException {
        try {
            String classpath = String.join(File.pathSeparator, project.getCompileClasspathElements());
            Main.compile(new String[]{
                    "--source-root", sourceDirectory.getAbsolutePath(),
                    "--output", outputFile.getAbsolutePath(),
                    "--runtime-path", runtimePath,
                    "--classpath", classpath
            });
            getLog().info("Generated " + outputFile);
        } catch (Exception exception) {
            throw new MojoExecutionException("Javelin compilation failed", exception);
        }
    }
}
