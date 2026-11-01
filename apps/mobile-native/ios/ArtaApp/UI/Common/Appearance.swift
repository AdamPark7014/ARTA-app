import UIKit

/// Lo que SwiftUI no alcanza con modificadores: barras de navegación y de pestañas,
/// segmentados y buscador (UIKit). Se aplica al arrancar y en cada cambio de entidad
/// ANTES de que la app se rehaga (`ActiveEntity.apply`): las barras nuevas toman estos
/// valores al crearse. Letra redondeada (SF Pro Rounded) también aquí.
@MainActor
enum ArtaAppearance {
    static func apply(_ entity: ArtaEntity) {
        let light = entity == .arta
        let text = UIColor(hex: light ? 0x0C0C0D : 0xF2F2F4)
        let secondary = UIColor(hex: light ? 0x55555C : 0xA1A1AA)
        // Los mismos de `ArtaColor.tertiary` (los anteriores no daban AA sobre las barras).
        let tertiary = UIColor(hex: light ? 0x6B6B73 : 0x8A8A93)
        let line = light ? UIColor(hex: 0x0C0C0D, alpha: 0.07) : UIColor(white: 1, alpha: 0.07)
        let accent = UIColor(hex: light ? 0x0C0C0D : 0xC7CCD4)
        let onAccent = light ? UIColor.white : UIColor(hex: 0x0A0A0B)
        let selectedTab = UIColor(hex: light ? 0x0C0C0D : 0xE6E9EE)

        // Barra de navegación: títulos redondeados; el grande, ligero (30 px, 300).
        let title: [NSAttributedString.Key: Any] = [.font: rounded(17, .semibold), .foregroundColor: text]
        let largeTitle: [NSAttributedString.Key: Any] = [.font: rounded(30, .light), .foregroundColor: text, .kern: -0.6]
        let nav = UINavigationBar.appearance()
        nav.tintColor = accent
        if #available(iOS 26.0, *) {
            // Liquid Glass: el fondo y el borde los pone el sistema; solo la letra.
            nav.titleTextAttributes = title
            nav.largeTitleTextAttributes = largeTitle
        } else {
            let standard = UINavigationBarAppearance()
            standard.configureWithDefaultBackground()
            standard.backgroundEffect = UIBlurEffect(style: light ? .systemChromeMaterialLight : .systemChromeMaterialDark)
            standard.backgroundColor = light ? UIColor(hex: 0xF7F6F3, alpha: 0.86) : UIColor(hex: 0x08080A, alpha: 0.82)
            standard.shadowColor = line
            standard.titleTextAttributes = title
            standard.largeTitleTextAttributes = largeTitle
            let edge = UINavigationBarAppearance()
            edge.configureWithTransparentBackground()
            edge.titleTextAttributes = title
            edge.largeTitleTextAttributes = largeTitle
            nav.standardAppearance = standard
            nav.compactAppearance = standard
            nav.scrollEdgeAppearance = edge
            nav.compactScrollEdgeAppearance = edge
        }

        // Barra de pestañas: línea fina arriba, activo en tinta / plata clara.
        let tabs = UITabBarAppearance()
        tabs.configureWithDefaultBackground()
        if #unavailable(iOS 26.0) {
            tabs.backgroundEffect = UIBlurEffect(style: light ? .systemChromeMaterialLight : .systemChromeMaterialDark)
            tabs.backgroundColor = light ? UIColor(white: 1, alpha: 0.9) : UIColor(hex: 0x0B0B0D, alpha: 0.88)
            tabs.shadowColor = line
        }
        for item in [tabs.stackedLayoutAppearance, tabs.inlineLayoutAppearance, tabs.compactInlineLayoutAppearance] {
            item.normal.iconColor = tertiary
            item.normal.titleTextAttributes = [.font: rounded(10, .medium), .foregroundColor: tertiary]
            item.selected.iconColor = selectedTab
            item.selected.titleTextAttributes = [.font: rounded(10, .semibold), .foregroundColor: selectedTab]
            item.normal.badgeBackgroundColor = accent
            item.normal.badgeTextAttributes = [.font: rounded(11, .bold), .foregroundColor: onAccent]
        }
        let tabBar = UITabBar.appearance()
        tabBar.standardAppearance = tabs
        tabBar.scrollEdgeAppearance = tabs
        tabBar.tintColor = selectedTab
        tabBar.unselectedItemTintColor = tertiary

        // Segmentado: en ARTA, fondo hueso con la opción activa blanca; en Auditorio, plata con texto negro.
        let segmented = UISegmentedControl.appearance()
        segmented.backgroundColor = light ? UIColor(hex: 0xEFEDE8) : UIColor(white: 1, alpha: 0.035)
        segmented.selectedSegmentTintColor = light ? .white : UIColor(hex: 0xC7CCD4)
        segmented.setTitleTextAttributes([.font: rounded(13, .semibold), .foregroundColor: secondary], for: .normal)
        segmented.setTitleTextAttributes(
            [.font: rounded(13, .semibold), .foregroundColor: light ? text : onAccent],
            for: .selected
        )

        // Buscador y campos de UIKit.
        UITextField.appearance(whenContainedInInstancesOf: [UISearchBar.self]).font = rounded(17, .regular)
        UISwitch.appearance().onTintColor = accent
        UIRefreshControl.appearance().tintColor = tertiary
    }

    /// SF Pro Rounded en el peso pedido (si el sistema no la diera, la normal).
    static func rounded(_ size: CGFloat, _ weight: UIFont.Weight) -> UIFont {
        let base = UIFont.systemFont(ofSize: size, weight: weight)
        guard let descriptor = base.fontDescriptor.withDesign(.rounded) else { return base }
        return UIFont(descriptor: descriptor, size: size)
    }
}
