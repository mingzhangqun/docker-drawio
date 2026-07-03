<%@ page trimDirectiveWhitespaces="true" %>
<%@ page import="java.io.*" %>
<%@ page import="java.nio.charset.StandardCharsets" %>
<%@ page import="java.nio.file.*" %>
<%@ page import="java.util.*" %>
<%@ page import="javax.servlet.http.HttpServletRequest" %>
<%!
private String json(String value)
{
    if (value == null) return "";

    StringBuilder sb = new StringBuilder();

    for (int i = 0; i < value.length(); i++)
    {
        char c = value.charAt(i);

        switch (c)
        {
            case '\\': sb.append("\\\\"); break;
            case '"': sb.append("\\\""); break;
            case '\b': sb.append("\\b"); break;
            case '\f': sb.append("\\f"); break;
            case '\n': sb.append("\\n"); break;
            case '\r': sb.append("\\r"); break;
            case '\t': sb.append("\\t"); break;
            default:
                if (c < 0x20)
                {
                    sb.append(String.format("\\u%04x", (int) c));
                }
                else
                {
                    sb.append(c);
                }
        }
    }

    return sb.toString();
}

private String readBody(HttpServletRequest request, int maxBytes) throws IOException
{
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    byte[] buffer = new byte[8192];
    int total = 0;
    int read;

    try (InputStream in = request.getInputStream())
    {
        while ((read = in.read(buffer)) != -1)
        {
            total += read;

            if (total > maxBytes)
            {
                throw new IOException("File is larger than the configured limit");
            }

            out.write(buffer, 0, read);
        }
    }

    return out.toString(StandardCharsets.UTF_8.name());
}

private File resolvePath(File base, String relPath) throws IOException
{
    if (relPath == null)
    {
        relPath = "";
    }

    relPath = relPath.replace('\\', '/');

    while (relPath.startsWith("/"))
    {
        relPath = relPath.substring(1);
    }

    File target = new File(base, relPath).getCanonicalFile();
    String basePath = base.getCanonicalPath();
    String targetPath = target.getCanonicalPath();

    if (!targetPath.equals(basePath) && !targetPath.startsWith(basePath + File.separator))
    {
        throw new SecurityException("Path is outside the Docker file directory");
    }

    return target;
}

private String mimeType(String name)
{
    String lower = name == null ? "" : name.toLowerCase(Locale.ENGLISH);

    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";

    return "text/xml";
}
%>
<%
String baseDirValue = System.getenv("DRAWIO_DOCKER_FILE_DIR");

if (baseDirValue == null || baseDirValue.trim().isEmpty())
{
    response.sendError(404, "Docker file storage is disabled");
    return;
}

File baseDir = new File(baseDirValue).getCanonicalFile();
int maxBytes = 25 * 1024 * 1024;
String maxBytesValue = System.getenv("DRAWIO_DOCKER_FILE_MAX_BYTES");

if (maxBytesValue != null && !maxBytesValue.trim().isEmpty())
{
    try
    {
        maxBytes = Integer.parseInt(maxBytesValue.trim());
    }
    catch (NumberFormatException ignored) {}
}

String method = request.getMethod();
String action = request.getParameter("action");
String relPath = request.getParameter("path");

try
{
    if (!baseDir.exists() && !baseDir.mkdirs())
    {
        throw new IOException("Unable to create Docker file directory");
    }

    if (!baseDir.isDirectory())
    {
        throw new IOException("Docker file path is not a directory");
    }

    if ("GET".equals(method) && "list".equals(action))
    {
        File dir = resolvePath(baseDir, relPath);

        if (!dir.exists() || !dir.isDirectory())
        {
            response.sendError(404, "Directory not found");
            return;
        }

        File[] children = dir.listFiles();

        if (children == null)
        {
            children = new File[0];
        }

        Arrays.sort(children, new Comparator<File>()
        {
            public int compare(File a, File b)
            {
                if (a.isDirectory() != b.isDirectory())
                {
                    return a.isDirectory() ? -1 : 1;
                }

                return a.getName().compareToIgnoreCase(b.getName());
            }
        });

        response.setContentType("application/json;charset=UTF-8");
        out.print("{\"path\":\"" + json(baseDir.toPath().relativize(dir.toPath()).toString().replace(File.separatorChar, '/')) + "\",\"items\":[");

        for (int i = 0; i < children.length; i++)
        {
            File child = children[i];
            String childPath = baseDir.toPath().relativize(child.toPath()).toString().replace(File.separatorChar, '/');

            if (i > 0)
            {
                out.print(",");
            }

            out.print("{\"name\":\"" + json(child.getName()) + "\",\"path\":\"" + json(childPath) + "\",\"directory\":" + child.isDirectory() + ",\"size\":" + child.length() + ",\"modified\":" + child.lastModified() + "}");
        }

        out.print("]}");
    }
    else if ("GET".equals(method) && "read".equals(action))
    {
        File file = resolvePath(baseDir, relPath);

        if (!file.exists() || !file.isFile())
        {
            response.sendError(404, "File not found");
            return;
        }

        if (file.length() > maxBytes)
        {
            response.sendError(413, "File is larger than the configured limit");
            return;
        }

        byte[] bytes = Files.readAllBytes(file.toPath());

        if ("base64".equals(request.getParameter("encoding")))
        {
            response.setContentType("text/plain;charset=UTF-8");
            out.print(Base64.getEncoder().encodeToString(bytes));
            return;
        }

        String contentType = mimeType(file.getName());
        response.setContentType(contentType + (contentType.startsWith("text/") ? ";charset=UTF-8" : ""));

        if (contentType.startsWith("text/"))
        {
            out.print(new String(bytes, StandardCharsets.UTF_8));
        }
        else
        {
            response.getOutputStream().write(bytes);
        }
    }
    else if ("POST".equals(method) && "save".equals(action))
    {
        File file = resolvePath(baseDir, relPath);
        File parent = file.getParentFile();

        if (parent != null && !parent.exists() && !parent.mkdirs())
        {
            throw new IOException("Unable to create parent directory");
        }

        String data = readBody(request, maxBytes);
        byte[] bytes;

        if ("base64".equals(request.getParameter("encoding")))
        {
            bytes = Base64.getDecoder().decode(data.trim());
        }
        else
        {
            bytes = data.getBytes(StandardCharsets.UTF_8);
        }

        Files.write(file.toPath(), bytes, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        response.setContentType("application/json;charset=UTF-8");
        out.print("{\"ok\":true,\"path\":\"" + json(baseDir.toPath().relativize(file.toPath()).toString().replace(File.separatorChar, '/')) + "\"}");
    }
    else if ("POST".equals(method) && "delete".equals(action))
    {
        File file = resolvePath(baseDir, relPath);

        if (!file.exists() || !file.isFile())
        {
            response.sendError(404, "File not found");
            return;
        }

        if (!file.delete())
        {
            throw new IOException("Unable to delete file");
        }

        response.setContentType("application/json;charset=UTF-8");
        out.print("{\"ok\":true}");
    }
    else
    {
        response.sendError(400, "Unsupported action");
    }
}
catch (SecurityException e)
{
    response.sendError(403, e.getMessage());
}
catch (IOException e)
{
    response.sendError(500, e.getMessage());
}
%>
