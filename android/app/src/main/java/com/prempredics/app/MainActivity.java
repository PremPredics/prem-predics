package com.prempredics.app;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.widget.FrameLayout;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int STATUS_BAR_PURPLE = Color.rgb(123, 97, 216);
    private static final int NAV_BAR_PURPLE = Color.rgb(169, 140, 240);
    private static final int STATUS_OVERLAY_ID = 9001;
    private static final int NAV_OVERLAY_ID = 9002;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applySystemBarStyling();
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBarStyling();
    }

    private void applySystemBarStyling() {
        Window window = getWindow();

        WindowCompat.setDecorFitsSystemWindows(window, true);
        window.setStatusBarColor(STATUS_BAR_PURPLE);
        window.setNavigationBarColor(NAV_BAR_PURPLE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsAppearance(
                    0,
                    WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                );
            }
        } else {
            window.getDecorView().setSystemUiVisibility(0);
        }

        addSystemBarBackgroundOverlay(STATUS_OVERLAY_ID, getSystemBarDimension("status_bar_height"), Gravity.TOP, STATUS_BAR_PURPLE);
        addSystemBarBackgroundOverlay(NAV_OVERLAY_ID, getSystemBarDimension("navigation_bar_height"), Gravity.BOTTOM, NAV_BAR_PURPLE);
    }

    private void addSystemBarBackgroundOverlay(int viewId, int height, int gravity, int color) {
        if (height <= 0) {
            return;
        }

        FrameLayout decorView = (FrameLayout) getWindow().getDecorView();
        View existingView = decorView.findViewById(viewId);

        if (existingView == null) {
            existingView = new View(this);
            existingView.setId(viewId);
            decorView.addView(existingView);
        }

        existingView.setBackgroundColor(color);
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            height,
            gravity
        );
        existingView.setLayoutParams(params);
        existingView.bringToFront();
    }

    private int getSystemBarDimension(String resourceName) {
        int resourceId = getResources().getIdentifier(resourceName, "dimen", "android");
        if (resourceId > 0) {
            return getResources().getDimensionPixelSize(resourceId);
        }
        return 0;
    }
}
