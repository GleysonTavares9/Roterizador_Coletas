package com.roterizacao.driver

import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.roterizacao.driver.utils.AppColors

class PrivacyPolicyActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.setBackgroundColor(ContextCompat.getColor(this, R.color.surface))

        // Header
        val header = LinearLayout(this)
        header.orientation = LinearLayout.VERTICAL
        header.setBackgroundColor(AppColors.primaryDark(this))
        header.setPadding(dp(24), dp(40), dp(24), dp(24))

        val title = TextView(this)
        title.text = "Política de Privacidade"
        title.textSize = 24f
        title.setTextColor(android.graphics.Color.WHITE)
        title.setTypeface(null, android.graphics.Typeface.BOLD)
        title.gravity = Gravity.CENTER

        val subtitle = TextView(this)
        subtitle.text = "Roterizacao Driver"
        subtitle.textSize = 16f
        subtitle.setTextColor(AppColors.whiteAlpha(200))
        subtitle.gravity = Gravity.CENTER
        subtitle.setPadding(0, dp(8), 0, 0)

        val date = TextView(this)
        date.text = "Última atualização: 29/12/2024"
        date.textSize = 12f
        date.setTextColor(AppColors.whiteAlpha(180))
        date.gravity = Gravity.CENTER
        date.setPadding(0, dp(4), 0, 0)

        header.addView(title)
        header.addView(subtitle)
        header.addView(date)
        root.addView(header)

        // Content
        val scroll = ScrollView(this)
        val content = LinearLayout(this)
        content.orientation = LinearLayout.VERTICAL
        content.setPadding(dp(20), dp(20), dp(20), dp(20))

        // Sections
        addSection(content, "1. Introdução", 
            "O aplicativo Roterizacao Driver respeita sua privacidade e está comprometido em proteger seus dados pessoais.")

        addSection(content, "2. Dados Coletados",
            "• Localização GPS (para rastreamento de entregas)\n" +
            "• Nome, email, CPF\n" +
            "• Android ID (identificador único)\n" +
            "• Nível de bateria\n" +
            "• Tipo de rede\n\n" +
            "❌ NÃO coletamos IMEI ou número de telefone")

        addSection(content, "3. Uso dos Dados",
            "• Rastreamento de entregas\n" +
            "• Otimização de rotas\n" +
            "• Relatórios de desempenho\n" +
            "• Comunicação com a central")

        addSection(content, "4. Compartilhamento",
            "✓ Sua empresa empregadora\n" +
            "✓ Provedores de serviço (Google Maps, Supabase)\n\n" +
            "✗ NÃO vendemos seus dados\n" +
            "✗ NÃO compartilhamos para marketing")

        addSection(content, "5. Segurança",
            "🔒 Criptografia de dados\n" +
            "🔒 Servidores seguros\n" +
            "🔒 Acesso restrito\n" +
            "🔒 Backup regular")

        addSection(content, "6. Seus Direitos (LGPD)",
            "Você pode:\n" +
            "• Acessar seus dados\n" +
            "• Corrigir informações\n" +
            "• Excluir seus dados\n" +
            "• Revogar consentimento\n\n" +
            "Contato: suporte@roterizacao.com.br")

        addSection(content, "7. Retenção",
            "• Localização: 90 dias\n" +
            "• Histórico: 5 anos\n" +
            "• Dados pessoais: Durante vínculo ativo")

        addSection(content, "8. Conformidade Legal",
            "Este app está em conformidade com:\n" +
            "• LGPD (Lei 13.709/2018)\n" +
            "• Marco Civil da Internet")

        val footer = TextView(this)
        footer.text = "© 2024 Roterizacao Driver\nVersão 1.0"
        footer.textSize = 12f
        footer.setTextColor(AppColors.textSecondary(this))
        footer.gravity = Gravity.CENTER
        footer.setPadding(0, dp(32), 0, dp(16))
        content.addView(footer)

        scroll.addView(content)
        root.addView(scroll)

        setContentView(root)
    }

    private fun addSection(container: LinearLayout, title: String, content: String) {
        val titleView = TextView(this)
        titleView.text = title
        titleView.textSize = 18f
        titleView.setTextColor(AppColors.textPrimary(this))
        titleView.setTypeface(null, android.graphics.Typeface.BOLD)
        titleView.setPadding(0, dp(16), 0, dp(8))

        val contentView = TextView(this)
        contentView.text = content
        contentView.textSize = 14f
        contentView.setTextColor(AppColors.textSecondary(this))
        contentView.lineHeight = (contentView.textSize * 1.5f).toInt()

        container.addView(titleView)
        container.addView(contentView)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
