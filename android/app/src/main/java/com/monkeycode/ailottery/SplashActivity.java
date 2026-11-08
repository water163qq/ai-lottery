package com.monkeycode.ailottery;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

public class SplashActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        int pad = dp(32);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0B0F1A"));

        LinearLayout center = new LinearLayout(this);
        center.setOrientation(LinearLayout.VERTICAL);
        center.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout.LayoutParams centerLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT);
        centerLp.gravity = Gravity.CENTER;
        center.setLayoutParams(centerLp);
        center.setPadding(pad, pad, pad, pad);

        ImageView logo = new ImageView(this);
        int size = dp(128);
        LinearLayout.LayoutParams logoLp = new LinearLayout.LayoutParams(size, size);
        logo.setLayoutParams(logoLp);
        logo.setImageResource(R.drawable.splash);
        logo.setAlpha(0f);
        logo.setScaleX(0.5f);
        logo.setScaleY(0.5f);
        center.addView(logo);

        TextView name = new TextView(this);
        name.setText(R.string.app_name);
        name.setTextColor(Color.parseColor("#E8ECF4"));
        name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        name.setGravity(Gravity.CENTER);
        name.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams nameLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        nameLp.topMargin = dp(22);
        name.setLayoutParams(nameLp);
        name.setAlpha(0f);
        name.setTranslationY(dp(14));
        center.addView(name);

        TextView slogan = new TextView(this);
        slogan.setText(R.string.app_slogan);
        slogan.setTextColor(Color.parseColor("#8A93A8"));
        slogan.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        slogan.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams sloganLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        sloganLp.topMargin = dp(8);
        slogan.setLayoutParams(sloganLp);
        slogan.setAlpha(0f);
        slogan.setTranslationY(dp(10));
        center.addView(slogan);

        TextView version = new TextView(this);
        version.setText("v" + BuildConfig.VERSION_NAME);
        version.setTextColor(Color.parseColor("#5E6679"));
        version.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        version.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams verLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        verLp.topMargin = dp(18);
        version.setLayoutParams(verLp);
        version.setAlpha(0f);
        center.addView(version);

        TextView tip = new TextView(this);
        tip.setText(R.string.app_disclaimer);
        tip.setTextColor(Color.parseColor("#4E5566"));
        tip.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        tip.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams tipLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT);
        tipLp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        tipLp.bottomMargin = dp(36);
        tip.setLayoutParams(tipLp);
        tip.setAlpha(0f);
        root.addView(tip);

        root.addView(center);
        setContentView(root);

        logo.animate().alpha(1f).scaleX(1f).scaleY(1f)
                .setDuration(650)
                .setInterpolator(new OvershootInterpolator(1.4f))
                .start();
        name.animate().alpha(1f).translationY(0f).setStartDelay(180).setDuration(500).start();
        slogan.animate().alpha(1f).translationY(0f).setStartDelay(340).setDuration(500).start();
        version.animate().alpha(1f).setStartDelay(480).setDuration(400).start();
        tip.animate().alpha(1f).setStartDelay(600).setDuration(500).start();

        logo.animate().rotation(360f).setDuration(1400)
                .setInterpolator(new AccelerateDecelerateInterpolator()).start();

        root.postDelayed(new Runnable() {
            @Override
            public void run() {
                startActivity(new Intent(SplashActivity.this, MainActivity.class));
                overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
                finish();
            }
        }, 1600);
    }

    private int dp(int v) {
        return Math.round(getResources().getDisplayMetrics().density * v);
    }
}
