package javelin.ui;

public interface ResourceOptions {
    ResourceOptions retry(int count);
    ResourceOptions retryDelay(int milliseconds);
    ResourceOptions timeout(int milliseconds);
    ResourceOptions staleTime(int milliseconds);
    ResourceOptions cacheTime(int milliseconds);
    ResourceOptions persistent(String key);
    ResourceOptions offline(boolean enabled);
    ResourceOptions revalidateOnReconnect(boolean enabled);
}
