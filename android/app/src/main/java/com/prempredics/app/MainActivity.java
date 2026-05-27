package com.prempredics.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#2E1065"));
        window.setNavigationBarColor(Color.parseColor("#2E1065"));
        window.getDecorView().setSystemUiVisibility(0);
    }
}
